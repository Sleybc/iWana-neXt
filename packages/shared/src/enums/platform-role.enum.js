'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.PlatformRole = void 0;
/**
 * Roles exclusivos para usuarios de plataforma (@iwana/platform_users).
 * Solo SYSTEM_ADMIN e IWANA_SUPPORT pueden operar a nivel de plataforma.
 * Los roles de tenant-level estan en user-role.enum.ts.
 */
var PlatformRole;
(function (PlatformRole) {
  PlatformRole['SYSTEM_ADMIN'] = 'SYSTEM_ADMIN';
  PlatformRole['IWANA_SUPPORT'] = 'IWANA_SUPPORT';
})(PlatformRole || (exports.PlatformRole = PlatformRole = {}));
//# sourceMappingURL=platform-role.enum.js.map
