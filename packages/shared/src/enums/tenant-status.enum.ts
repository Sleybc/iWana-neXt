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
  PROVISIONING_FAILED = 'PROVISIONING_FAILED',
}
