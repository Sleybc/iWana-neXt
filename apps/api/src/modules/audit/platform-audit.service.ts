import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Brackets, DataSource, type EntityManager, SelectQueryBuilder } from 'typeorm';
import { PlatformAuditLog, summarizeErrorForLog } from '@iwana/db';
import { AUDIT_SESSION_ACTIONS, PLATFORM_AUDIT_ACCESS_ACTIONS } from '@iwana/shared';
import {
  isTenantStatusSummaryPeriodMonths,
  TENANT_STATUS_SUMMARY_DEFAULT_PERIOD_MONTHS,
  type TenantStatusSummaryPeriodMonths,
} from '@iwana/shared';
import type {
  EntityLifecycleMonth,
  EntityStatusEvent,
} from './interfaces/entity-lifecycle.interface';
import { sanitizeAuditPayload } from './audit-sanitize.policy';
import { AuditEntryInput } from './interfaces/audit-entry.interface';
import { AuditActorResolver } from './audit-actor.resolver';
import { AuditLogResponseDto, PlatformAuditLogListResponseDto } from './dto/audit-log-response.dto';
import { QueryPlatformAuditLogsDto } from './dto/query-platform-audit-logs.dto';
import {
  AUDIT_EXPORT_MAX_ROWS,
  applyCreatedAtFilter,
  AuditCsvExportResult,
  buildAuditCsv,
} from './helpers/audit-export.helper';
import { encodeAuditCursor, decodeAuditCursor } from '../../common/pagination';

/**
 * Servicio de audit trail para operaciones de plataforma.
 *
 * Escribe entradas append-only en la tabla `platform_audit_logs` del schema
 * público. Se usa exclusivamente para operaciones de SYSTEM_ADMIN e
 * IWANA_SUPPORT que no pertenecen a ningún tenant específico.
 *
 * - Nunca lanza excepciones: los fallos de auditoria son silenciosos.
 * - Si tenantId/schemaName están presentes en el input, se ignoran
 *   (las entradas de plataforma SIEMPRE van al schema público).
 * - oldValue/newValue se sanitizan aquí con la misma denylist que
 *   AuditService / AuditInterceptor (SEC-P1 / D-C / H-2).
 *
 * RF-AUD-03 (PRD-MOD01-DEFINICION v1.1): operaciones SYSTEM_ADMIN/IWANA_SUPPORT
 * registradas en public.platform_audit_logs (ADR-018).
 * Ley 1581/2012: retención mínima 7 años.
 */
/** Zona del mes calendario de las series de ciclo de vida (literal fijo, no input). */
const LIFECYCLE_TIME_ZONE = 'America/Bogota';

/** Defensa en profundidad: el controlador ya valida `months` (6, 12 o 24). */
function assertLifecycleMonths(months: number): void {
  if (!isTenantStatusSummaryPeriodMonths(months)) {
    throw new RangeError(`Largo de serie no admitido: ${months}`);
  }
}

@Injectable()
export class PlatformAuditService {
  private readonly logger = new Logger(PlatformAuditService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly auditActorResolver: AuditActorResolver,
  ) {}

  /**
   * Registra una entrada de audit trail en platform_audit_logs (schema público).
   * Fire-and-forget: retorna void y swallows cualquier error interno.
   */
  async log(entry: AuditEntryInput): Promise<void> {
    try {
      const oldValue = sanitizeAuditPayload(entry.oldValue ?? null);
      const newValue = sanitizeAuditPayload(entry.newValue ?? null);
      const repo = this.dataSource.getRepository(PlatformAuditLog);
      const logEntry = repo.create({
        userId: entry.userId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        oldValue,
        newValue,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
        requestId: entry.requestId ?? null,
      });
      await repo.save(logEntry);
    } catch (err) {
      this.logger.warn(
        `Fallo al registrar platform audit entry ` +
          `[action=${entry.action} entity=${entry.entityType}:${entry.entityId}]: ${summarizeErrorForLog(err)}`,
      );
    }
  }

  /**
   * Registra una entrada en la transacción del llamador (`platform_audit_logs`).
   *
   * A diferencia de `log()`, los errores se propagan: la operación de negocio se revierte
   * junto con su auditoría (p. ej. cambios de permisos de plataforma, ADR-114 v1.3 §9).
   */
  async logWithin(entry: AuditEntryInput, manager: EntityManager): Promise<void> {
    const logEntry = manager.create(PlatformAuditLog, {
      userId: entry.userId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      oldValue: sanitizeAuditPayload(entry.oldValue ?? null),
      newValue: sanitizeAuditPayload(entry.newValue ?? null),
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
      requestId: entry.requestId ?? null,
    });
    await manager.save(PlatformAuditLog, logEntry);
  }

  /**
   * Consulta platform_audit_logs con filtros opcionales y paginación cursor-based.
   * Sin dependencia de TenantContext — opera siempre sobre el schema público.
   * Soporta fromDate/toDate (ISO) en paridad con AuditQueryService.
   *
   * Cursor compuesto (DEF-3): (createdAt, id) en lugar de id < cursor.
   */
  async query(dto: QueryPlatformAuditLogsDto = {}): Promise<PlatformAuditLogListResponseDto> {
    const limit = dto.limit ?? 50;

    const qb = this.dataSource
      .createQueryBuilder(PlatformAuditLog, 'audit')
      .orderBy('audit.createdAt', 'DESC')
      .addOrderBy('audit.id', 'DESC')
      .take(limit + 1);

    this.applyFilters(qb, dto);

    // Cursor compuesto (DEF-3)
    if (dto.cursor) {
      const { d: cursorDate, i: cursorId } = decodeAuditCursor(dto.cursor);
      qb.andWhere(
        new Brackets((innerQb) => {
          innerQb
            .where('audit.createdAt < :cursorDate', { cursorDate })
            .orWhere('audit.createdAt = :cursorDate AND audit.id < :cursorId', {
              cursorDate,
              cursorId,
            });
        }),
      );
    }

    const data = await qb.getMany();

    // Total sin cursor
    const countQb = this.applyFilters(
      this.dataSource.createQueryBuilder(PlatformAuditLog, 'audit'),
      dto,
    );
    const total = await countQb.getCount();

    const hasNext = data.length > limit;
    const slice = hasNext ? data.slice(0, limit) : data;
    const lastItem = slice[slice.length - 1];
    const nextCursor =
      hasNext && lastItem ? encodeAuditCursor(lastItem.createdAt, lastItem.id) : null;

    const actors = await this.auditActorResolver.resolveMany(
      slice.map((entry) => entry.userId),
      { source: 'platform' },
    );

    return {
      data: slice.map((entry) => this.toResponseDto(entry, actors)),
      nextCursor,
      total,
    };
  }

  /**
   * Altas (primer `CREATE` de cada entidad: un `CREATE` posterior sobre la misma
   * entidad, p. ej. subir un asset de branding, no es otra alta) y bajas (`DELETE`,
   * entidad distinta por mes) de un `entityType` en los `months` meses calendario
   * America/Bogota que terminan en el mes de `asOf`, del más antiguo al actual, con
   * huecos en 0. Una consulta. El registro es append-only: las entidades ya
   * purgadas siguen contando.
   */
  async countEntityLifecycleByMonth(
    entityType: string,
    asOf: Date = new Date(),
    months: TenantStatusSummaryPeriodMonths = TENANT_STATUS_SUMMARY_DEFAULT_PERIOD_MONTHS,
  ): Promise<EntityLifecycleMonth[]> {
    assertLifecycleMonths(months);
    const rows: Array<{ month: string; created: string; removed: string }> =
      await this.dataSource.query(
        `WITH bounds AS (
           SELECT date_trunc('month', $2::timestamptz AT TIME ZONE '${LIFECYCLE_TIME_ZONE}') AS current_month,
                  date_trunc('month', $2::timestamptz AT TIME ZONE '${LIFECYCLE_TIME_ZONE}')
                    - make_interval(months => $3::int - 1) AS first_month
         ),
         months AS (
           SELECT to_char(m, 'YYYY-MM') AS month
             FROM bounds,
                  generate_series(bounds.first_month,
                                  bounds.current_month,
                                  interval '1 month') AS m
         ),
         first_creates AS (
           SELECT l.entity_id, MIN(l.created_at) AS created_at
             FROM public.platform_audit_logs l
            WHERE l.entity_type = $1
              AND l.action = 'CREATE'
              AND l.created_at <= $2::timestamptz
            GROUP BY l.entity_id
         ),
         created AS (
           SELECT to_char(date_trunc('month', f.created_at AT TIME ZONE '${LIFECYCLE_TIME_ZONE}'), 'YYYY-MM') AS month,
                  COUNT(*) AS created
             FROM first_creates f, bounds
            WHERE f.created_at >= bounds.first_month AT TIME ZONE '${LIFECYCLE_TIME_ZONE}'
            GROUP BY 1
         ),
         removed AS (
           SELECT to_char(date_trunc('month', l.created_at AT TIME ZONE '${LIFECYCLE_TIME_ZONE}'), 'YYYY-MM') AS month,
                  COUNT(DISTINCT l.entity_id) FILTER (WHERE l.action = 'DELETE') AS removed
             FROM public.platform_audit_logs l, bounds
            WHERE l.entity_type = $1
              AND l.action = 'DELETE'
              AND l.created_at <= $2::timestamptz
              AND l.created_at >= bounds.first_month AT TIME ZONE '${LIFECYCLE_TIME_ZONE}'
            GROUP BY 1
         )
         SELECT months.month,
                COALESCE(created.created, 0) AS created,
                COALESCE(removed.removed, 0) AS removed
           FROM months
           LEFT JOIN created USING (month)
           LEFT JOIN removed USING (month)
          ORDER BY months.month`,
        [entityType, asOf.toISOString(), months],
      );
    return rows.map((row) => ({
      month: row.month,
      created: Number(row.created),
      removed: Number(row.removed),
    }));
  }

  /**
   * Eventos que informan el estado de las entidades de `entityType` (`new_value`
   * con `status`, o `DELETE` / `TENANT_PURGE_COMPLETED`, que no lo traen) entre las
   * acciones `actions`, hasta `asOf`, en orden cronológico: de cada entidad, el
   * último anterior a la ventana de `months` meses (America/Bogota) y todos los de
   * la ventana. Una consulta; la interpretación del estado es del módulo que llama.
   */
  async listEntityStatusEvents(
    entityType: string,
    actions: readonly string[],
    asOf: Date,
    months: TenantStatusSummaryPeriodMonths,
  ): Promise<EntityStatusEvent[]> {
    assertLifecycleMonths(months);
    const rows: Array<{
      entity_id: string;
      action: string;
      status: string | null;
      created_at: Date | string;
    }> = await this.dataSource.query(
      `WITH bounds AS (
         SELECT (date_trunc('month', $2::timestamptz AT TIME ZONE '${LIFECYCLE_TIME_ZONE}')
                   - make_interval(months => $3::int - 1)) AT TIME ZONE '${LIFECYCLE_TIME_ZONE}' AS window_start
       ),
       status_events AS (
         SELECT l.id, l.entity_id, l.action, l.new_value ->> 'status' AS status, l.created_at
           FROM public.platform_audit_logs l
          WHERE l.entity_type = $1
            AND l.action = ANY($4::text[])
            AND l.created_at <= $2::timestamptz
            AND (l.new_value ? 'status' OR l.action IN ('DELETE', 'TENANT_PURGE_COMPLETED'))
       ),
       prior AS (
         SELECT DISTINCT ON (e.entity_id) e.id, e.entity_id, e.action, e.status, e.created_at
           FROM status_events e, bounds
          WHERE e.created_at < bounds.window_start
          ORDER BY e.entity_id, e.created_at DESC, e.id DESC
       )
       SELECT entity_id, action, status, created_at
         FROM (
           SELECT id, entity_id, action, status, created_at FROM prior
           UNION ALL
           SELECT e.id, e.entity_id, e.action, e.status, e.created_at
             FROM status_events e, bounds
            WHERE e.created_at >= bounds.window_start
         ) AS events
        ORDER BY created_at, id`,
      [entityType, asOf.toISOString(), months, [...actions]],
    );
    return rows.map((row) => ({
      entityId: row.entity_id,
      action: row.action,
      status: row.status,
      at: new Date(row.created_at),
    }));
  }

  /**
   * Export CSV sync con los mismos filtros que `query` (sin cursor/limit), vía
   * {@link applyFilters}.
   * Máximo {@link AUDIT_EXPORT_MAX_ROWS} filas; `truncated=true` si hay más.
   */
  async exportCsv(dto: QueryPlatformAuditLogsDto = {}): Promise<AuditCsvExportResult> {
    const data = await this.applyFilters(
      this.dataSource.createQueryBuilder(PlatformAuditLog, 'audit'),
      dto,
    )
      .orderBy('audit.createdAt', 'DESC')
      .addOrderBy('audit.id', 'DESC')
      .take(AUDIT_EXPORT_MAX_ROWS + 1)
      .getMany();

    const truncated = data.length > AUDIT_EXPORT_MAX_ROWS;
    const rows = truncated ? data.slice(0, AUDIT_EXPORT_MAX_ROWS) : data;
    const actors = await this.auditActorResolver.resolveMany(
      rows.map((entry) => entry.userId),
      { source: 'platform' },
    );

    const csv = buildAuditCsv(
      rows.map((entry) => ({
        createdAt: entry.createdAt,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        actorLabel: this.resolveActorLabel(entry.userId, actors),
        ipAddress: entry.ipAddress,
        requestId: entry.requestId,
      })),
      { truncated, maxRows: AUDIT_EXPORT_MAX_ROWS },
    );

    return { csv, truncated, rowCount: rows.length };
  }

  /**
   * Único punto que traduce los filtros de {@link QueryPlatformAuditLogsDto} a
   * predicados SQL (F2-D5): lo comparten el listado, su total y la exportación.
   * Cursor y límite no son filtros: los aplica solo el listado.
   */
  private applyFilters(
    qb: SelectQueryBuilder<PlatformAuditLog>,
    dto: QueryPlatformAuditLogsDto,
  ): SelectQueryBuilder<PlatformAuditLog> {
    if (dto.action) qb.andWhere('audit.action = :action', { action: dto.action });
    if (dto.entityType)
      qb.andWhere('audit.entityType = :entityType', { entityType: dto.entityType });
    if (dto.userId) qb.andWhere('audit.userId = :userId', { userId: dto.userId });
    if (dto.excludeSessionEvents) {
      qb.andWhere('audit.action NOT IN (:...sessionActions)', {
        sessionActions: [...AUDIT_SESSION_ACTIONS],
      });
    }
    if (dto.excludeAccessEvents) {
      qb.andWhere('audit.action NOT IN (:...accessActions)', {
        accessActions: [...PLATFORM_AUDIT_ACCESS_ACTIONS],
      });
    }
    applyCreatedAtFilter(qb, 'audit', dto.fromDate, dto.toDate);
    return qb;
  }

  private resolveActorLabel(
    userId: string | null,
    actors: Map<string, AuditLogResponseDto['actor']>,
  ): string {
    if (!userId) {
      return this.auditActorResolver.systemActor().displayName;
    }
    return actors.get(userId)?.displayName ?? userId;
  }

  private toResponseDto(
    entry: PlatformAuditLog,
    actors: Map<string, AuditLogResponseDto['actor']>,
  ): AuditLogResponseDto {
    const actor = entry.userId
      ? (actors.get(entry.userId) ?? this.auditActorResolver.unknownActor(entry.userId))
      : this.auditActorResolver.systemActor();

    return {
      id: entry.id,
      userId: entry.userId,
      actor,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      oldValue: entry.oldValue,
      newValue: entry.newValue,
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
      requestId: entry.requestId,
      createdAt: entry.createdAt,
    };
  }
}
