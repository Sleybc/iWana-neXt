import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Brackets, DataSource } from 'typeorm';
import { PlatformAuditLog, summarizeErrorForLog } from '@iwana/db';
import { AUDIT_SESSION_ACTIONS, AuditAction } from '@iwana/shared';

/**
 * Lecturas auditadas (p. ej. `GET tenants/usage`, ADR-114): se conservan en el
 * historial, pero no son actividad; `excludeAccessEvents` las saca del feed.
 */
export const PLATFORM_AUDIT_ACCESS_ACTIONS = [
  AuditAction.LIST_ACCESS,
  AuditAction.RECORD_ACCESS,
] as const;
import type { TenantStatusSummaryMonth } from '@iwana/shared';
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
  buildCreatedAtFilter,
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
    const countQb = this.dataSource.createQueryBuilder(PlatformAuditLog, 'audit');
    if (dto.action) countQb.andWhere('audit.action = :action', { action: dto.action });
    if (dto.entityType)
      countQb.andWhere('audit.entityType = :entityType', { entityType: dto.entityType });
    if (dto.userId) countQb.andWhere('audit.userId = :userId', { userId: dto.userId });
    if (dto.excludeSessionEvents) {
      countQb.andWhere('audit.action NOT IN (:...sessionActions)', {
        sessionActions: [...AUDIT_SESSION_ACTIONS],
      });
    }
    if (dto.excludeAccessEvents) {
      countQb.andWhere('audit.action NOT IN (:...accessActions)', {
        accessActions: [...PLATFORM_AUDIT_ACCESS_ACTIONS],
      });
    }
    applyCreatedAtFilter(countQb, 'audit', dto.fromDate, dto.toDate);
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
   * Altas (`CREATE`) y bajas (`DELETE`, entidad distinta por mes) de un
   * `entityType` en los 12 meses calendario America/Bogota que terminan en el
   * mes de `asOf`, del más antiguo al actual, con huecos en 0. Una consulta.
   * El registro es append-only: las entidades ya purgadas siguen contando.
   */
  async countEntityLifecycleByMonth(
    entityType: string,
    asOf: Date = new Date(),
  ): Promise<TenantStatusSummaryMonth[]> {
    const rows: Array<{ month: string; created: string; removed: string }> =
      await this.dataSource.query(
        `WITH bounds AS (
           SELECT date_trunc('month', $2::timestamptz AT TIME ZONE '${LIFECYCLE_TIME_ZONE}') AS current_month
         ),
         months AS (
           SELECT to_char(m, 'YYYY-MM') AS month
             FROM bounds,
                  generate_series(bounds.current_month - interval '11 months',
                                  bounds.current_month,
                                  interval '1 month') AS m
         ),
         events AS (
           SELECT to_char(date_trunc('month', l.created_at AT TIME ZONE '${LIFECYCLE_TIME_ZONE}'), 'YYYY-MM') AS month,
                  COUNT(*) FILTER (WHERE l.action = 'CREATE') AS created,
                  COUNT(DISTINCT l.entity_id) FILTER (WHERE l.action = 'DELETE') AS removed
             FROM public.platform_audit_logs l, bounds
            WHERE l.entity_type = $1
              AND l.action IN ('CREATE', 'DELETE')
              AND l.created_at >= (bounds.current_month - interval '11 months') AT TIME ZONE '${LIFECYCLE_TIME_ZONE}'
            GROUP BY 1
         )
         SELECT months.month,
                COALESCE(events.created, 0) AS created,
                COALESCE(events.removed, 0) AS removed
           FROM months
           LEFT JOIN events USING (month)
          ORDER BY months.month`,
        [entityType, asOf.toISOString()],
      );
    return rows.map((row) => ({
      month: row.month,
      created: Number(row.created),
      removed: Number(row.removed),
    }));
  }

  /**
   * Export CSV sync con los mismos filtros que `query` (sin cursor/limit).
   * Máximo {@link AUDIT_EXPORT_MAX_ROWS} filas; `truncated=true` si hay más.
   */
  async exportCsv(dto: QueryPlatformAuditLogsDto = {}): Promise<AuditCsvExportResult> {
    const repo = this.dataSource.getRepository(PlatformAuditLog);
    const where = this.buildExportWhere(dto);

    const data = await repo.find({
      where,
      order: { createdAt: 'DESC', id: 'DESC' },
      take: AUDIT_EXPORT_MAX_ROWS + 1,
    });

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

  private buildExportWhere(dto: QueryPlatformAuditLogsDto): Record<string, unknown> {
    const where: Record<string, unknown> = {};

    if (dto.action) where['action'] = dto.action;
    if (dto.entityType) where['entityType'] = dto.entityType;
    if (dto.userId) where['userId'] = dto.userId;

    const createdAt = buildCreatedAtFilter(dto.fromDate, dto.toDate);
    if (createdAt) where['createdAt'] = createdAt;

    return where;
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
