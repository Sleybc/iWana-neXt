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
exports.OrganizationSiteBusinessHour = void 0;
const typeorm_1 = require('typeorm');
const shared_1 = require('@iwana/shared');
let OrganizationSiteBusinessHour = class OrganizationSiteBusinessHour {
  id;
  tenantId;
  siteId;
  weekday;
  opensAt;
  closesAt;
  isOpen;
  createdAt;
  updatedAt;
};
exports.OrganizationSiteBusinessHour = OrganizationSiteBusinessHour;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  OrganizationSiteBusinessHour.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  OrganizationSiteBusinessHour.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'site_id', type: 'uuid' }), __metadata('design:type', String)],
  OrganizationSiteBusinessHour.prototype,
  'siteId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      type: 'enum',
      enum: shared_1.BusinessHoursWeekday,
      enumName: 'business_hours_weekday_enum',
    }),
    __metadata('design:type', String),
  ],
  OrganizationSiteBusinessHour.prototype,
  'weekday',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'opens_at', type: 'time', nullable: true }),
    __metadata('design:type', Object),
  ],
  OrganizationSiteBusinessHour.prototype,
  'opensAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'closes_at', type: 'time', nullable: true }),
    __metadata('design:type', Object),
  ],
  OrganizationSiteBusinessHour.prototype,
  'closesAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'is_open', type: 'boolean', default: true }),
    __metadata('design:type', Boolean),
  ],
  OrganizationSiteBusinessHour.prototype,
  'isOpen',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  OrganizationSiteBusinessHour.prototype,
  'createdAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  OrganizationSiteBusinessHour.prototype,
  'updatedAt',
  void 0,
);
exports.OrganizationSiteBusinessHour = OrganizationSiteBusinessHour = __decorate(
  [
    (0, typeorm_1.Index)(
      'uq_organization_site_business_hours_site_weekday',
      ['tenantId', 'siteId', 'weekday'],
      {
        unique: true,
      },
    ),
    (0, typeorm_1.Index)('idx_organization_site_business_hours_tenant_site', [
      'tenantId',
      'siteId',
    ]),
    (0, typeorm_1.Entity)({ name: 'organization_site_business_hours' }),
  ],
  OrganizationSiteBusinessHour,
);
//# sourceMappingURL=organization-site-business-hour.entity.js.map
