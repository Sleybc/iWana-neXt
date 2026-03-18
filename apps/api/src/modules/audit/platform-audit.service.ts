import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PlatformAuditLog } from '@iwana/db';
import { AuditEntryInput } from './interfaces/audit-entry.interface';

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
      // Audit failure NUNCA debe bloquear la operacion principal
      this.logger.warn(
        `Fallo al registrar platform audit entry ` +
          `[action=${entry.action} entity=${entry.entityType}:${entry.entityId}]: ${String(err)}`,
      );
    }
  }
}
