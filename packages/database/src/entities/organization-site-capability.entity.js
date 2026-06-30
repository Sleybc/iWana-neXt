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
exports.OrganizationSiteCapabilityEntity = void 0;
const typeorm_1 = require('typeorm');
const shared_1 = require('@iwana/shared');
let OrganizationSiteCapabilityEntity = class OrganizationSiteCapabilityEntity {
  id;
  tenantId;
  siteId;
  capability;
  isEnabled;
};
exports.OrganizationSiteCapabilityEntity = OrganizationSiteCapabilityEntity;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  OrganizationSiteCapabilityEntity.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  OrganizationSiteCapabilityEntity.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'site_id', type: 'uuid' }), __metadata('design:type', String)],
  OrganizationSiteCapabilityEntity.prototype,
  'siteId',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'varchar', length: 40 }), __metadata('design:type', String)],
  OrganizationSiteCapabilityEntity.prototype,
  'capability',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'is_enabled', type: 'boolean', default: true }),
    __metadata('design:type', Boolean),
  ],
  OrganizationSiteCapabilityEntity.prototype,
  'isEnabled',
  void 0,
);
exports.OrganizationSiteCapabilityEntity = OrganizationSiteCapabilityEntity = __decorate(
  [
    (0, typeorm_1.Index)(
      'uq_organization_site_capabilities_site_capability',
      ['tenantId', 'siteId', 'capability'],
      {
        unique: true,
      },
    ),
    (0, typeorm_1.Index)('idx_organization_site_capabilities_tenant_site', ['tenantId', 'siteId']),
    (0, typeorm_1.Entity)({ name: 'organization_site_capabilities' }),
  ],
  OrganizationSiteCapabilityEntity,
);
//# sourceMappingURL=organization-site-capability.entity.js.map
