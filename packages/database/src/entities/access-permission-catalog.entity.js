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
exports.AccessPermissionCatalog = void 0;
const typeorm_1 = require('typeorm');
const shared_1 = require('@iwana/shared');
let AccessPermissionCatalog = class AccessPermissionCatalog {
  id;
  tenantId;
  permissionKey;
  moduleKey;
  action;
  description;
  catalogVersion;
  availability;
  isSystem;
  isActive;
};
exports.AccessPermissionCatalog = AccessPermissionCatalog;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  AccessPermissionCatalog.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  AccessPermissionCatalog.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'permission_key', type: 'varchar', length: 120 }),
    __metadata('design:type', String),
  ],
  AccessPermissionCatalog.prototype,
  'permissionKey',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'module_key', type: 'varchar', length: 60 }),
    __metadata('design:type', String),
  ],
  AccessPermissionCatalog.prototype,
  'moduleKey',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'varchar', length: 60 }), __metadata('design:type', String)],
  AccessPermissionCatalog.prototype,
  'action',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'varchar', length: 240 }), __metadata('design:type', String)],
  AccessPermissionCatalog.prototype,
  'description',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'catalog_version', type: 'varchar', length: 40 }),
    __metadata('design:type', String),
  ],
  AccessPermissionCatalog.prototype,
  'catalogVersion',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'varchar', length: 20 }), __metadata('design:type', String)],
  AccessPermissionCatalog.prototype,
  'availability',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'is_system', type: 'boolean', default: true }),
    __metadata('design:type', Boolean),
  ],
  AccessPermissionCatalog.prototype,
  'isSystem',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'is_active', type: 'boolean', default: true }),
    __metadata('design:type', Boolean),
  ],
  AccessPermissionCatalog.prototype,
  'isActive',
  void 0,
);
exports.AccessPermissionCatalog = AccessPermissionCatalog = __decorate(
  [
    (0, typeorm_1.Index)('uq_access_permission_catalog_tenant_key', ['tenantId', 'permissionKey'], {
      unique: true,
    }),
    (0, typeorm_1.Index)('idx_access_permission_catalog_tenant_module', ['tenantId', 'moduleKey']),
    (0, typeorm_1.Entity)({ name: 'access_permission_catalog' }),
  ],
  AccessPermissionCatalog,
);
//# sourceMappingURL=access-permission-catalog.entity.js.map
