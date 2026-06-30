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
exports.AccessProfile = void 0;
const typeorm_1 = require('typeorm');
let AccessProfile = class AccessProfile {
  id;
  tenantId;
  name;
  description;
  baseRoleConstraint;
  scopeSiteId;
  isSystem;
  isActive;
  createdAt;
  updatedAt;
  deletedAt;
};
exports.AccessProfile = AccessProfile;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  AccessProfile.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  AccessProfile.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'varchar', length: 120 }), __metadata('design:type', String)],
  AccessProfile.prototype,
  'name',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'text', nullable: true }), __metadata('design:type', Object)],
  AccessProfile.prototype,
  'description',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'base_role_constraint',
      type: 'varchar',
      length: 30,
      nullable: true,
    }),
    __metadata('design:type', Object),
  ],
  AccessProfile.prototype,
  'baseRoleConstraint',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'scope_site_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  AccessProfile.prototype,
  'scopeSiteId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'is_system', type: 'boolean', default: false }),
    __metadata('design:type', Boolean),
  ],
  AccessProfile.prototype,
  'isSystem',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'is_active', type: 'boolean', default: true }),
    __metadata('design:type', Boolean),
  ],
  AccessProfile.prototype,
  'isActive',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  AccessProfile.prototype,
  'createdAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  AccessProfile.prototype,
  'updatedAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.DeleteDateColumn)({ name: 'deleted_at', type: 'timestamptz' }),
    __metadata('design:type', Object),
  ],
  AccessProfile.prototype,
  'deletedAt',
  void 0,
);
exports.AccessProfile = AccessProfile = __decorate(
  [
    (0, typeorm_1.Index)('uq_access_profiles_tenant_name', ['tenantId', 'name'], {
      unique: true,
      where: '"deleted_at" IS NULL',
    }),
    (0, typeorm_1.Index)('idx_access_profiles_tenant_active', ['tenantId', 'isActive'], {
      where: '"deleted_at" IS NULL',
    }),
    (0, typeorm_1.Entity)({ name: 'access_profiles' }),
  ],
  AccessProfile,
);
//# sourceMappingURL=access-profile.entity.js.map
