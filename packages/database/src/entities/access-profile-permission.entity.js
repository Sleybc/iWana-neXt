'use strict';
var __decorate =
  (this && this.__decorate) ||
  function (decorators, target, key, desc) {
    var c = arguments.length,
      r =
        c < 3
          ? target
          : desc === null
            ? (desc = Object.getOwnPropertyDescriptor(target, key))
            : desc,
      d;
    if (typeof Reflect === 'object' && typeof Reflect.decorate === 'function')
      r = Reflect.decorate(decorators, target, key, desc);
    else
      for (var i = decorators.length - 1; i >= 0; i--)
        if ((d = decorators[i]))
          r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return (c > 3 && r && Object.defineProperty(target, key, r), r);
  };
var __metadata =
  (this && this.__metadata) ||
  function (k, v) {
    if (typeof Reflect === 'object' && typeof Reflect.metadata === 'function')
      return Reflect.metadata(k, v);
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.AccessProfilePermission = void 0;
const typeorm_1 = require('typeorm');
const shared_1 = require('@iwana/shared');
let AccessProfilePermission = class AccessProfilePermission {
  id;
  tenantId;
  profileId;
  permissionKey;
};
exports.AccessProfilePermission = AccessProfilePermission;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  AccessProfilePermission.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  AccessProfilePermission.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'profile_id', type: 'uuid' }), __metadata('design:type', String)],
  AccessProfilePermission.prototype,
  'profileId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'permission_key', type: 'varchar', length: 120 }),
    __metadata('design:type', String),
  ],
  AccessProfilePermission.prototype,
  'permissionKey',
  void 0,
);
exports.AccessProfilePermission = AccessProfilePermission = __decorate(
  [
    (0, typeorm_1.Index)(
      'uq_access_profile_permissions_profile_permission',
      ['tenantId', 'profileId', 'permissionKey'],
      {
        unique: true,
      },
    ),
    (0, typeorm_1.Index)('idx_access_profile_permissions_tenant_profile', [
      'tenantId',
      'profileId',
    ]),
    (0, typeorm_1.Entity)({ name: 'access_profile_permissions' }),
  ],
  AccessProfilePermission,
);
//# sourceMappingURL=access-profile-permission.entity.js.map
