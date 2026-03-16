/**
 * Acciones auditables en la plataforma iWana neXt.
 * Toda operacion sensible debe emitir un evento de audit trail.
 */
export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  LOGIN_FAILED = 'LOGIN_FAILED',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  PASSWORD_CHANGED = 'PASSWORD_CHANGED',
  PASSWORD_RESET_REQUESTED = 'PASSWORD_RESET_REQUESTED',
  MFA_ENABLED = 'MFA_ENABLED',
  MFA_DISABLED = 'MFA_DISABLED',
  MFA_SETUP_INITIATED = 'MFA_SETUP_INITIATED',
  TENANT_PROVISIONED = 'TENANT_PROVISIONED',
  TENANT_SUSPENDED = 'TENANT_SUSPENDED',
  TENANT_ACTIVATED = 'TENANT_ACTIVATED',
  /** Rotacion exitosa de refresh token — RF-AUD-02 (HLD-MOD02) */
  REFRESH = 'REFRESH',
  /** Email del usuario verificado correctamente — RF-AUD-02 (HLD-MOD02) */
  EMAIL_VERIFIED = 'EMAIL_VERIFIED',
  /** Reset de contrasena completado via token temporal — RF-AUD-02 (HLD-MOD02) */
  PASSWORD_RESET_COMPLETED = 'PASSWORD_RESET_COMPLETED',
}
