import { AuditAction } from '@iwana/shared';
/**
 * Entidad AuditLog — schema por tenant (dinamico via search_path).
 *
 * Registro append-only de todas las operaciones CUD del tenant.
 * Generado por el AuditInterceptor global (NestJS) sin intervencion
 * del codigo de negocio (excepto skip con @SkipAudit).
 *
 * APPEND-ONLY: sin UpdateDateColumn, sin DeleteDateColumn.
 * La RLS en PostgreSQL refuerza esto: REVOKE DELETE, REVOKE UPDATE.
 * Retencion minima 7 anios (Ley 1581/2012 + CRC).
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 1 (@iwana/audit)
 */
export declare class AuditLog {
    id: string;
    /** FK logica a public.tenants.id — para trazabilidad cross-schema */
    tenantId: string;
    /** FK logica a users.id del tenant. Null para jobs del sistema */
    userId: string | null;
    /** Accion auditada (enum AuditAction) */
    action: AuditAction;
    /** Nombre de la entidad afectada. Ejemplo: 'User', 'Subscriber', 'Invoice' */
    entityType: string;
    /** ID de la entidad afectada */
    entityId: string;
    /** Estado anterior (para operaciones de actualizacion). Sanitizado sin PII cifrado */
    oldValue: Record<string, unknown> | null;
    /** Estado nuevo. Sanitizado sin PII cifrado */
    newValue: Record<string, unknown> | null;
    /** IP del solicitante. Longitud 45 soporta IPv6 completo */
    ipAddress: string | null;
    userAgent: string | null;
    /** ID de correlacion de la request (header X-Request-Id o generado) */
    requestId: string | null;
    /** Unica marca temporal del registro — inmutable */
    createdAt: Date;
}
//# sourceMappingURL=audit-log.entity.d.ts.map