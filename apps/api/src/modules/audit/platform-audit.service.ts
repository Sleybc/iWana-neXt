import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Brackets, DataSource } from 'typeorm';
import { PlatformAuditLog } from '@iwana/db';
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
          `[action=${entry.action} entity=${entry.entityType}:${entry.entityId}]: ${String(err)}`,
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
