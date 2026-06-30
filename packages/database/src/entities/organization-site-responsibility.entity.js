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
exports.OrganizationSiteResponsibilityEntity = void 0;
const typeorm_1 = require('typeorm');
const shared_1 = require('@iwana/shared');
let OrganizationSiteResponsibilityEntity = class OrganizationSiteResponsibilityEntity {
  id;
  tenantId;
  siteId;
  responsibility;
  userId;
  validFrom;
  validTo;
};
exports.OrganizationSiteResponsibilityEntity = OrganizationSiteResponsibilityEntity;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  OrganizationSiteResponsibilityEntity.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  OrganizationSiteResponsibilityEntity.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'site_id', type: 'uuid' }), __metadata('design:type', String)],
  OrganizationSiteResponsibilityEntity.prototype,
  'siteId',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'varchar', length: 40 }), __metadata('design:type', String)],
  OrganizationSiteResponsibilityEntity.prototype,
  'responsibility',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'user_id', type: 'uuid' }), __metadata('design:type', String)],
  OrganizationSiteResponsibilityEntity.prototype,
  'userId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'valid_from', type: 'date', default: () => 'CURRENT_DATE' }),
    __metadata('design:type', String),
  ],
  OrganizationSiteResponsibilityEntity.prototype,
  'validFrom',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'valid_to', type: 'date', nullable: true }),
    __metadata('design:type', Object),
  ],
  OrganizationSiteResponsibilityEntity.prototype,
  'validTo',
  void 0,
);
exports.OrganizationSiteResponsibilityEntity = OrganizationSiteResponsibilityEntity = __decorate(
  [
    (0, typeorm_1.Index)('idx_organization_site_responsibilities_tenant_site', [
      'tenantId',
      'siteId',
    ]),
    (0, typeorm_1.Index)(
      'uq_organization_site_responsibilities_current',
      ['tenantId', 'siteId', 'responsibility', 'validTo'],
      {
        unique: true,
      },
    ),
    (0, typeorm_1.Entity)({ name: 'organization_site_responsibilities' }),
  ],
  OrganizationSiteResponsibilityEntity,
);
//# sourceMappingURL=organization-site-responsibility.entity.js.map
