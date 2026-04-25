import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuditLog, runInTenantSchema, TenantContext } from '@iwana/db';
import { AuditEntryInput } from './interfaces/audit-entry.interface';

/**
 * Servicio de audit trail para operaciones de tenant.
 *
 * Escribe entradas append-only en la tabla `audit_logs` del schema del tenant.
 * - Nunca lanza excepciones: los fallos de auditoria son silenciosos para
 *   no bloquear la operacion principal del negocio.
 * - Si no hay TenantContext activo y tampoco se proveen tenantId/schemaName
 *   en el input, la entrada se omite.
 * - Cada llamada a log() crea su propia transaccion independiente (QueryRunner
 *   separado del de la operacion principal).
 *
 * SEGURIDAD:
 * - oldValue/newValue deben ser sanitizados por el caller: sin passwordHash,
 *   sin mfaSecret, sin campos cifrados, sin PII en texto plano.
 * - La tabla audit_logs tiene RLS: REVOKE DELETE, REVOKE UPDATE (tenant_template.sql).
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 1 (@iwana/audit)
 * Ley 1581/2012: retencion minima 7 anios.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Registra una entrada de audit trail en el schema del tenant.
   * Fire-and-forget: retorna void y swallows cualquier error interno.
   */
  async log(entry: AuditEntryInput): Promise<void> {
    try {
      // Resolver tenantId y schemaName desde el input o desde TenantContext
      let tenantId = entry.tenantId;
      let schemaName = entry.schemaName;

      if (!tenantId || !schemaName) {
        const ctx = TenantContext.get();
        if (!ctx) {
          // Sin contexto de tenant ni valores explicitos — omitir silenciosamente
          return;
        }
        tenantId = ctx.tenantId;
        schemaName = ctx.schemaName;
      }

      await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
        const logEntry = qr.manager.create(AuditLog, {
          tenantId,
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

        await qr.manager.save(AuditLog, logEntry);
      });
    } catch (err) {
      // Audit failure NUNCA debe bloquear la operacion principal
      this.logger.warn(
        `Fallo al registrar audit entry ` +
          `[action=${entry.action} entity=${entry.entityType}:${entry.entityId}]: ${String(err)}`,
      );
    }
  }
}
