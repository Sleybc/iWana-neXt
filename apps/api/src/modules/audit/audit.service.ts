import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuditLog, runInTenantSchema, TenantContext } from '@iwana/db';
import { sanitizeAuditPayload } from './audit-sanitize.policy';
import { ANOMALIA_AUDITORIA_PREFIX } from './audit.constants';
import { PlatformAuditService } from './platform-audit.service';
import { AuditEntryInput } from './interfaces/audit-entry.interface';

/**
 * Servicio de audit trail para operaciones de tenant.
 *
 * Escribe entradas append-only en la tabla `audit_logs` del schema del tenant.
 * - Nunca lanza excepciones: los fallos de auditoria son silenciosos para
 *   no bloquear la operacion principal del negocio.
 * - Si no hay TenantContext activo y tampoco se proveen tenantId/schemaName
 *   en el input, la entrada **no se descarta**: se reencamina a
 *   `public.platform_audit_logs` como anomalia (ver `log()`).
 * - Cada llamada a log() crea su propia transaccion independiente (QueryRunner
 *   separado del de la operacion principal).
 *
 * SEGURIDAD (SEC-P1 / D-C):
 * - oldValue/newValue se sanitizan **aquí** con la misma denylist que
 *   `AuditInterceptor` — las rutas directas (p. ej. expediente.service) no
 *   pueden evadir el control.
 * - Inmutabilidad append-only: trigger PostgreSQL `reject_audit_mutation()` (migr. 075).
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
    private readonly platformAuditService: PlatformAuditService,
  ) {}

  /**
   * Registra una entrada de audit trail en el schema del tenant.
   * Fire-and-forget: retorna void y swallows cualquier error interno.
   *
   * Sin destino de tenant resoluble la entrada **no se descarta**: se reencamina
   * a `public.platform_audit_logs` con el prefijo `ANOMALIA_AUDITORIA:`, el mismo
   * camino que `AuditInterceptor` usa en su rama sin destino (H-01).
   *
   * El `return` silencioso anterior (S-8) borraba toda llamada emitida fuera de un
   * tenant — es decir, **todas** las de plataforma, que por definicion no tienen
   * TenantContext. Un llamador de plataforma debe usar `PlatformAuditService`
   * directamente; si llega aqui, eso mismo es el hallazgo que hay que dejar trazado.
   */
  async log(entry: AuditEntryInput): Promise<void> {
    try {
      // Resolver tenantId y schemaName desde el input o desde TenantContext
      let tenantId = entry.tenantId;
      let schemaName = entry.schemaName;

      if (!tenantId || !schemaName) {
        const ctx = TenantContext.get();
        if (!ctx) {
          this.logger.warn(
            `Entrada de audit sin destino de tenant resoluble; se reencamina como anomalia ` +
              `[action=${entry.action} entity=${entry.entityType}:${entry.entityId}]`,
          );
          await this.platformAuditService.log({
            ...entry,
            entityType: `${ANOMALIA_AUDITORIA_PREFIX}${entry.entityType}`,
          });
          return;
        }
        tenantId = ctx.tenantId;
        schemaName = ctx.schemaName;
      }

      const oldValue = sanitizeAuditPayload(entry.oldValue ?? null);
      const newValue = sanitizeAuditPayload(entry.newValue ?? null);

      await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
        const logEntry = qr.manager.create(AuditLog, {
          tenantId,
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
