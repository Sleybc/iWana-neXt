import { AuditAction } from '@iwana/shared';

/**
 * Input para registrar una entrada de audit trail.
 *
 * Cuando tenantId/schemaName se omiten, el servicio los resuelve desde TenantContext.
 * Si tampoco hay TenantContext activo, la entrada se omite silenciosamente.
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 1 (@iwana/audit)
 */
export interface AuditEntryInput {
  /** Accion auditada */
  action: AuditAction;
  /** Nombre de la entidad afectada. Ejemplo: 'User', 'Tenant' */
  entityType: string;
  /** ID de la entidad afectada */
  entityId: string;
  /** Estado anterior — sanitizado, sin campos cifrados ni contrasenas */
  oldValue?: Record<string, unknown> | null;
  /** Estado nuevo — sanitizado, sin campos cifrados ni contrasenas */
  newValue?: Record<string, unknown> | null;
  /**
   * ID del usuario que realizo la accion.
   * Null para acciones del sistema (jobs BullMQ, startup).
   */
  userId?: string | null;
  /**
   * Tenant UUID — si se omite, se extrae de TenantContext.
   * Requerido para eventos que ocurren outside del middleware (ej: auth flows explicitos).
   */
  tenantId?: string;
  /**
   * Nombre del schema PostgreSQL — si se omite, se extrae de TenantContext.
   */
  schemaName?: string;
  /** IP del solicitante (IPv4 o IPv6, max 45 chars) */
  ipAddress?: string | null;
  /** User-Agent del cliente */
  userAgent?: string | null;
  /** Request ID para correlacion de logs */
  requestId?: string | null;
}
