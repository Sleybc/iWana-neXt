import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Brackets, DataSource } from 'typeorm';
import { AuditLog, runInTenantSchema, TenantContext } from '@iwana/db';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';
import { AuditActorResolver } from './audit-actor.resolver';
import { AuditLogListResponseDto, AuditLogResponseDto } from './dto/audit-log-response.dto';
import {
  AUDIT_EXPORT_MAX_ROWS,
  applyCreatedAtFilter,
  AuditCsvExportResult,
  buildAuditCsv,
  buildCreatedAtFilter,
} from './helpers/audit-export.helper';
import { encodeAuditCursor, decodeAuditCursor } from '../../common/pagination';

/**
 * Servicio de consulta de audit logs del tenant.
 *
 * Solo lectura — los writes pasan por AuditService.
 * Usa paginación cursor-based compuesta (createdAt, id) para evitar saltos
 * y repeticiones de registros (DEF-3, ADR-065 §Decisión 12).
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 4 (@iwana/audit)
 */
@Injectable()
export class AuditQueryService {
  private readonly logger = new Logger(AuditQueryService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly auditActorResolver: AuditActorResolver,
  ) {}

  /**
   * Consulta el audit log del tenant activo con filtros opcionales y paginacion cursor.
   *
   * Estrategia cursor (DEF-3): el cursor codifica `{ d: createdAt ISO, i: id }`.
   * Predicado:
   *   (created_at < :cursorDate) OR (created_at = :cursorDate AND id < :cursorId)
   * ordenados por created_at DESC, id DESC.
   */
  async query(dto: QueryAuditLogsDto): Promise<AuditLogListResponseDto> {
    const { schemaName } = TenantContext.getOrThrow();
    const limit = dto.limit ?? 50;

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const qb = qr.manager
        .createQueryBuilder(AuditLog, 'audit')
        .orderBy('audit.createdAt', 'DESC')
        .addOrderBy('audit.id', 'DESC')
        .take(limit + 1); // +1 para saber si hay pagina siguiente

      // Filtros estáticos
      if (dto.action) qb.andWhere('audit.action = :action', { action: dto.action });
      if (dto.entityType)
        qb.andWhere('audit.entityType = :entityType', { entityType: dto.entityType });
      if (dto.entityId) qb.andWhere('audit.entityId = :entityId', { entityId: dto.entityId });
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

      // Total sin cursor (el COUNT se computa sin el predicado de cursor)
      const countQb = qr.manager.createQueryBuilder(AuditLog, 'audit');
      if (dto.action) countQb.andWhere('audit.action = :action', { action: dto.action });
      if (dto.entityType)
        countQb.andWhere('audit.entityType = :entityType', { entityType: dto.entityType });
      if (dto.entityId) countQb.andWhere('audit.entityId = :entityId', { entityId: dto.entityId });
      if (dto.userId) countQb.andWhere('audit.userId = :userId', { userId: dto.userId });
      applyCreatedAtFilter(countQb, 'audit', dto.fromDate, dto.toDate);
      const total = await countQb.getCount();

      const hasNext = data.length > limit;
      const items = hasNext ? data.slice(0, limit) : data;
      const lastItem = items[items.length - 1];
      const nextCursor =
        hasNext && lastItem ? encodeAuditCursor(lastItem.createdAt, lastItem.id) : null;

      const actors = await this.auditActorResolver.resolveMany(
        items.map((entry) => entry.userId),
        { source: 'tenant', queryRunner: qr },
      );

      return {
        data: items.map((entry) => this.toResponseDto(entry, actors)),
        nextCursor,
        total,
      };
    });
  }

  /**
   * Export CSV sync con los mismos filtros que `query` (sin cursor/limit).
   * Máximo {@link AUDIT_EXPORT_MAX_ROWS} filas; `truncated=true` si hay más.
   */
  async exportCsv(dto: QueryAuditLogsDto): Promise<AuditCsvExportResult> {
    const { schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const repo = qr.manager.getRepository(AuditLog);
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
        { source: 'tenant', queryRunner: qr },
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
    });
  }

  private buildExportWhere(dto: QueryAuditLogsDto): Record<string, unknown> {
    const where: Record<string, unknown> = {};

    if (dto.action) where['action'] = dto.action;
    if (dto.entityType) where['entityType'] = dto.entityType;
    if (dto.entityId) where['entityId'] = dto.entityId;
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
    entry: AuditLog,
    actors: Map<string, AuditLogResponseDto['actor']>,
  ): AuditLogResponseDto {
    const actor = entry.userId
      ? (actors.get(entry.userId) ?? this.auditActorResolver.unknownActor(entry.userId))
      : this.auditActorResolver.systemActor();

    return {
      id: entry.id,
      tenantId: entry.tenantId,
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
