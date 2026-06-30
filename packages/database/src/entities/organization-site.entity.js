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
exports.OrganizationSite = void 0;
const typeorm_1 = require('typeorm');
const shared_1 = require('@iwana/shared');
let OrganizationSite = class OrganizationSite {
  id;
  tenantId;
  name;
  code;
  siteType;
  address;
  municipality;
  department;
  country;
  latitude;
  longitude;
  contactName;
  contactPhone;
  isPrimary;
  isActive;
  createdAt;
  updatedAt;
  deletedAt;
};
exports.OrganizationSite = OrganizationSite;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  OrganizationSite.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  OrganizationSite.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'varchar', length: 160 }), __metadata('design:type', String)],
  OrganizationSite.prototype,
  'name',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'varchar', length: 40 }), __metadata('design:type', String)],
  OrganizationSite.prototype,
  'code',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'site_type', type: 'varchar', length: 40 }),
    __metadata('design:type', String),
  ],
  OrganizationSite.prototype,
  'siteType',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ type: 'varchar', length: 240, nullable: true }),
    __metadata('design:type', Object),
  ],
  OrganizationSite.prototype,
  'address',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ type: 'varchar', length: 120, nullable: true }),
    __metadata('design:type', Object),
  ],
  OrganizationSite.prototype,
  'municipality',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ type: 'varchar', length: 120, nullable: true }),
    __metadata('design:type', Object),
  ],
  OrganizationSite.prototype,
  'department',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ type: 'varchar', length: 2, default: 'CO' }),
    __metadata('design:type', String),
  ],
  OrganizationSite.prototype,
  'country',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ type: 'numeric', precision: 10, scale: 7, nullable: true }),
    __metadata('design:type', Object),
  ],
  OrganizationSite.prototype,
  'latitude',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ type: 'numeric', precision: 10, scale: 7, nullable: true }),
    __metadata('design:type', Object),
  ],
  OrganizationSite.prototype,
  'longitude',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'contact_name', type: 'varchar', length: 160, nullable: true }),
    __metadata('design:type', Object),
  ],
  OrganizationSite.prototype,
  'contactName',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'contact_phone', type: 'varchar', length: 32, nullable: true }),
    __metadata('design:type', Object),
  ],
  OrganizationSite.prototype,
  'contactPhone',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'is_primary', type: 'boolean', default: false }),
    __metadata('design:type', Boolean),
  ],
  OrganizationSite.prototype,
  'isPrimary',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'is_active', type: 'boolean', default: true }),
    __metadata('design:type', Boolean),
  ],
  OrganizationSite.prototype,
  'isActive',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  OrganizationSite.prototype,
  'createdAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  OrganizationSite.prototype,
  'updatedAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.DeleteDateColumn)({ name: 'deleted_at', type: 'timestamptz' }),
    __metadata('design:type', Object),
  ],
  OrganizationSite.prototype,
  'deletedAt',
  void 0,
);
exports.OrganizationSite = OrganizationSite = __decorate(
  [
    (0, typeorm_1.Index)('uq_organization_sites_tenant_code', ['tenantId', 'code'], {
      unique: true,
      where: '"deleted_at" IS NULL',
    }),
    (0, typeorm_1.Index)('uq_organization_sites_tenant_primary', ['tenantId', 'isPrimary'], {
      unique: true,
      where: '"deleted_at" IS NULL AND "is_primary" = true',
    }),
    (0, typeorm_1.Index)('idx_organization_sites_tenant_active', ['tenantId', 'isActive'], {
      where: '"deleted_at" IS NULL',
    }),
    (0, typeorm_1.Entity)({ name: 'organization_sites' }),
  ],
  OrganizationSite,
);
//# sourceMappingURL=organization-site.entity.js.map
