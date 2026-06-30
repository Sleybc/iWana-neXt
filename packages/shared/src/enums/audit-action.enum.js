'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.AuditAction = void 0;
/**
 * Acciones auditables en la plataforma iWana neXt.
 * Toda operacion sensible debe emitir un evento de audit trail.
 */
var AuditAction;
(function (AuditAction) {
  AuditAction['CREATE'] = 'CREATE';
  AuditAction['UPDATE'] = 'UPDATE';
  AuditAction['DELETE'] = 'DELETE';
  AuditAction['LOGIN'] = 'LOGIN';
  AuditAction['LOGOUT'] = 'LOGOUT';
  AuditAction['LOGIN_FAILED'] = 'LOGIN_FAILED';
  AuditAction['ACCOUNT_LOCKED'] = 'ACCOUNT_LOCKED';
  AuditAction['PASSWORD_CHANGED'] = 'PASSWORD_CHANGED';
  AuditAction['PASSWORD_RESET_REQUESTED'] = 'PASSWORD_RESET_REQUESTED';
  AuditAction['MFA_ENABLED'] = 'MFA_ENABLED';
  AuditAction['MFA_DISABLED'] = 'MFA_DISABLED';
  AuditAction['MFA_SETUP_INITIATED'] = 'MFA_SETUP_INITIATED';
  AuditAction['TENANT_PROVISIONED'] = 'TENANT_PROVISIONED';
  AuditAction['TENANT_SUSPENDED'] = 'TENANT_SUSPENDED';
  AuditAction['TENANT_ACTIVATED'] = 'TENANT_ACTIVATED';
  /** Rotacion exitosa de refresh token — RF-AUD-02 (HLD-MOD02) */
  AuditAction['REFRESH'] = 'REFRESH';
  /** Email del usuario verificado correctamente — RF-AUD-02 (HLD-MOD02) */
  AuditAction['EMAIL_VERIFIED'] = 'EMAIL_VERIFIED';
  /** Reset de contrasena completado via token temporal — RF-AUD-02 (HLD-MOD02) */
  AuditAction['PASSWORD_RESET_COMPLETED'] = 'PASSWORD_RESET_COMPLETED';
})(AuditAction || (exports.AuditAction = AuditAction = {}));
//# sourceMappingURL=audit-action.enum.js.map
