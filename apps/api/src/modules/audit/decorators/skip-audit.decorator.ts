import { SetMetadata } from '@nestjs/common';

/**
 * Clave de metadata para omitir la auditoria automatica del AuditInterceptor.
 * Usar en handlers que emiten sus propios eventos de audit (ej: AuthController login)
 * o en operaciones de solo lectura que no requieren audit trail.
 *
 * Uso:
 *   @SkipAudit()
 *   async sensitiveHandler() { ... }
 */
export const SKIP_AUDIT_KEY = 'skipAudit';
export const SkipAudit = () => SetMetadata(SKIP_AUDIT_KEY, true);
