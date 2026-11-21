/**
 * Estado del ciclo de vida de un tenant (ISP) en la plataforma.
 * SUSPENDED retorna HTTP 403 en todos los endpoints del tenant.
 */
export enum TenantStatus {
  PROVISIONING = 'PROVISIONING',
  ACTIVE = 'ACTIVE',
  /** El tenant esta suspendido — todos los endpoints retornan HTTP 403 */
  SUSPENDED = 'SUSPENDED',
  INACTIVE = 'INACTIVE',
  /** Eliminacion solicitada; datos retenidos hasta purga fisica diferida */
  MARKED_FOR_DELETION = 'MARKED_FOR_DELETION',
  PROVISIONING_FAILED = 'PROVISIONING_FAILED',
}

/**
 * Estados que exigen atención de plataforma en el resumen de empresas
 * (`TenantStatusSummary.attention`). El orden de la lista no es la severidad;
 * la severidad la fija el servicio que construye el resumen.
 */
export const TENANT_ATTENTION_STATUSES = [
  'PROVISIONING_FAILED',
  'SUSPENDED',
  'MARKED_FOR_DELETION',
] as const;
