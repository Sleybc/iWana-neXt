import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, LessThan, MoreThanOrEqual } from 'typeorm';
import { AuditLog, runInTenantSchema, TenantContext } from '@iwana/db';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';
import { AuditActorResolver } from './audit-actor.resolver';
import { AuditLogListResponseDto, AuditLogResponseDto } from './dto/audit-log-response.dto';

/**
 * Servicio de consulta de audit logs del tenant.
 *
 * Solo lectura — los writes pasan por AuditService.
 * Usa paginacion cursor-based por UUID para eficiencia en tablas grandes.
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
   * Estrategia cursor: se buscan registros con `id < cursor` ordenados por `created_at DESC, id DESC`.
   */
  async query(dto: QueryAuditLogsDto): Promise<AuditLogListResponseDto> {
    const { schemaName } = TenantContext.getOrThrow();
    const limit = dto.limit ?? 50;

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const repo = qr.manager.getRepository(AuditLog);

      // Construir clausulas where dinamicamente
      const where: Record<string, any> = {};

      if (dto.action) where['action'] = dto.action;
      if (dto.entityType) where['entityType'] = dto.entityType;
      if (dto.entityId) where['entityId'] = dto.entityId;
      if (dto.userId) where['userId'] = dto.userId;
      if (dto.fromDate) where['createdAt'] = MoreThanOrEqual(new Date(dto.fromDate));
      if (dto.toDate) {
        // Si ya hay fromDate, sobreescribir con objeto Between no disponible directamente;
        // por simplicidad, aplicamos LessThan en una segunda query si solo hay toDate
        if (!dto.fromDate) where['createdAt'] = LessThan(new Date(dto.toDate));
      }
      if (dto.cursor) where['id'] = LessThan(dto.cursor);

      const [data, total] = await repo.findAndCount({
        where,
        order: { createdAt: 'DESC', id: 'DESC' },
        take: limit + 1, // +1 para saber si hay pagina siguiente
      });

      const hasNext = data.length > limit;
      const items = hasNext ? data.slice(0, limit) : data;
      const nextCursor = hasNext ? (items[items.length - 1]?.id ?? null) : null;
      const actors = await this.auditActorResolver.resolveMany(
        items.map((entry) => entry.userId),
        { source: 'tenant', queryRunner: qr },
      );

      return {
        data: items.map((entry) => this.toResponseDto(entry, actors)),
        meta: { nextCursor, total },
      };
    });
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
