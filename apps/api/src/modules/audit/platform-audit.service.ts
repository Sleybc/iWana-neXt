import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, LessThan } from 'typeorm';
import { PlatformAuditLog } from '@iwana/db';
import { AuditEntryInput } from './interfaces/audit-entry.interface';
import { AuditActorResolver } from './audit-actor.resolver';
import { AuditLogResponseDto, PlatformAuditLogListResponseDto } from './dto/audit-log-response.dto';

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
      const repo = this.dataSource.getRepository(PlatformAuditLog);
      const logEntry = repo.create({
        userId: entry.userId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        oldValue: entry.oldValue ?? null,
        newValue: entry.newValue ?? null,
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
   */
  async query(
    params: {
      limit?: number;
      cursor?: string;
      action?: string;
      entityType?: string;
      userId?: string;
    } = {},
  ): Promise<PlatformAuditLogListResponseDto> {
    const limit = params.limit ?? 50;
    const repo = this.dataSource.getRepository(PlatformAuditLog);

    const where: Record<string, unknown> = {};
    if (params.action) where['action'] = params.action;
    if (params.entityType) where['entityType'] = params.entityType;
    if (params.userId) where['userId'] = params.userId;
    if (params.cursor) where['id'] = LessThan(params.cursor);

    const [data, total] = await repo.findAndCount({
      where,
      order: { createdAt: 'DESC', id: 'DESC' },
      take: limit + 1,
    });

    const hasNext = data.length > limit;
    const slice = hasNext ? data.slice(0, limit) : data;
    const nextCursor = hasNext ? (slice[slice.length - 1]?.id ?? null) : null;
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
