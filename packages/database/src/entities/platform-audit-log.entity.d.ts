/**
 * Entidad PlatformAuditLog — schema publico.
 *
 * Registro de auditoria para operaciones a nivel plataforma
 * (acciones de SYSTEM_ADMIN e IWANA_SUPPORT sobre tenants,
 * usuarios de plataforma y configuraciones globales).
 *
 * APPEND-ONLY: sin UpdateDateColumn, sin DeleteDateColumn.
 * La RLS en PostgreSQL refuerza esto: REVOKE DELETE, REVOKE UPDATE.
 * Retencion minima 7 anios (Ley 1581/2012 + CRC).
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 3 (Modelo de Datos)
 */
export declare class PlatformAuditLog {
    id: string;
    /** ID del usuario de plataforma que realizo la accion. Null = sistema/job */
    userId: string | null;
    /** Accion realizada. Ejemplo: 'TENANT_CREATED', 'PLATFORM_USER_SUSPENDED' */
    action: string;
    /** Tipo de entidad afectada. Ejemplo: 'Tenant', 'PlatformUser' */
    entityType: string;
    /** ID de la entidad afectada */
    entityId: string;
    /** Estado anterior de la entidad (para operaciones de actualizacion) */
    oldValue: Record<string, unknown> | null;
    /** Estado nuevo de la entidad */
    newValue: Record<string, unknown> | null;
    /** IP del solicitante. Longitud 45 soporta IPv6 completo */
    ipAddress: string | null;
    userAgent: string | null;
    /** ID de correlacion de la request (para trazabilidad) */
    requestId: string | null;
    /** Inmutable — unica marca temporal del registro */
    createdAt: Date;
}
//# sourceMappingURL=platform-audit-log.entity.d.ts.map