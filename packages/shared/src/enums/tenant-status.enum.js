'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.TenantStatus = void 0;
/**
 * Estado del ciclo de vida de un tenant (ISP) en la plataforma.
 * SUSPENDED retorna HTTP 403 en todos los endpoints del tenant.
 */
var TenantStatus;
(function (TenantStatus) {
  TenantStatus['PROVISIONING'] = 'PROVISIONING';
  TenantStatus['ACTIVE'] = 'ACTIVE';
  /** El tenant esta suspendido — todos los endpoints retornan HTTP 403 */
  TenantStatus['SUSPENDED'] = 'SUSPENDED';
  TenantStatus['INACTIVE'] = 'INACTIVE';
  /** Eliminacion solicitada; datos retenidos hasta purga fisica diferida */
  TenantStatus['MARKED_FOR_DELETION'] = 'MARKED_FOR_DELETION';
  TenantStatus['PROVISIONING_FAILED'] = 'PROVISIONING_FAILED';
})(TenantStatus || (exports.TenantStatus = TenantStatus = {}));
//# sourceMappingURL=tenant-status.enum.js.map
