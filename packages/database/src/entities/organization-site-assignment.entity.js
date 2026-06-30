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
exports.OrganizationSiteAssignment = void 0;
const typeorm_1 = require('typeorm');
const shared_1 = require('@iwana/shared');
let OrganizationSiteAssignment = class OrganizationSiteAssignment {
  id;
  tenantId;
  siteId;
  userId;
  assignmentType;
  validFrom;
  validTo;
  isActive;
};
exports.OrganizationSiteAssignment = OrganizationSiteAssignment;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  OrganizationSiteAssignment.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  OrganizationSiteAssignment.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'site_id', type: 'uuid' }), __metadata('design:type', String)],
  OrganizationSiteAssignment.prototype,
  'siteId',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'user_id', type: 'uuid' }), __metadata('design:type', String)],
  OrganizationSiteAssignment.prototype,
  'userId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'assignment_type', type: 'varchar', length: 40 }),
    __metadata('design:type', String),
  ],
  OrganizationSiteAssignment.prototype,
  'assignmentType',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'valid_from', type: 'date', default: () => 'CURRENT_DATE' }),
    __metadata('design:type', String),
  ],
  OrganizationSiteAssignment.prototype,
  'validFrom',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'valid_to', type: 'date', nullable: true }),
    __metadata('design:type', Object),
  ],
  OrganizationSiteAssignment.prototype,
  'validTo',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'is_active', type: 'boolean', default: true }),
    __metadata('design:type', Boolean),
  ],
  OrganizationSiteAssignment.prototype,
  'isActive',
  void 0,
);
exports.OrganizationSiteAssignment = OrganizationSiteAssignment = __decorate(
  [
    (0, typeorm_1.Index)('idx_organization_site_assignments_tenant_site_active', [
      'tenantId',
      'siteId',
      'isActive',
    ]),
    (0, typeorm_1.Index)('idx_organization_site_assignments_tenant_user_active', [
      'tenantId',
      'userId',
      'isActive',
    ]),
    (0, typeorm_1.Entity)({ name: 'organization_site_assignments' }),
  ],
  OrganizationSiteAssignment,
);
//# sourceMappingURL=organization-site-assignment.entity.js.map
