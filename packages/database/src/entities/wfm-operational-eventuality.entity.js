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
exports.WfmOperationalEventuality = void 0;
const typeorm_1 = require('typeorm');
const shared_1 = require('@iwana/shared');
let WfmOperationalEventuality = class WfmOperationalEventuality {
  id;
  tenantId;
  userId;
  organizationSiteId;
  type;
  status;
  startsAt;
  endsAt;
  reason;
  origin;
  requiresHrReview;
  createdById;
  createdAt;
  updatedAt;
  deletedAt;
};
exports.WfmOperationalEventuality = WfmOperationalEventuality;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  WfmOperationalEventuality.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  WfmOperationalEventuality.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'user_id', type: 'uuid' }), __metadata('design:type', String)],
  WfmOperationalEventuality.prototype,
  'userId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'organization_site_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  WfmOperationalEventuality.prototype,
  'organizationSiteId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'type', type: 'varchar', length: 40 }),
    __metadata('design:type', String),
  ],
  WfmOperationalEventuality.prototype,
  'type',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'status', type: 'varchar', length: 20, default: 'pending' }),
    __metadata('design:type', String),
  ],
  WfmOperationalEventuality.prototype,
  'status',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'starts_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  WfmOperationalEventuality.prototype,
  'startsAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'ends_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  WfmOperationalEventuality.prototype,
  'endsAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'reason', type: 'varchar', length: 320, nullable: true }),
    __metadata('design:type', Object),
  ],
  WfmOperationalEventuality.prototype,
  'reason',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'origin', type: 'varchar', length: 80, nullable: true }),
    __metadata('design:type', Object),
  ],
  WfmOperationalEventuality.prototype,
  'origin',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'requires_hr_review', type: 'boolean', default: false }),
    __metadata('design:type', Boolean),
  ],
  WfmOperationalEventuality.prototype,
  'requiresHrReview',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'created_by_id', type: 'uuid' }),
    __metadata('design:type', String),
  ],
  WfmOperationalEventuality.prototype,
  'createdById',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  WfmOperationalEventuality.prototype,
  'createdAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  WfmOperationalEventuality.prototype,
  'updatedAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.DeleteDateColumn)({ name: 'deleted_at', type: 'timestamptz' }),
    __metadata('design:type', Object),
  ],
  WfmOperationalEventuality.prototype,
  'deletedAt',
  void 0,
);
exports.WfmOperationalEventuality = WfmOperationalEventuality = __decorate(
  [
    (0, typeorm_1.Index)('idx_wfm_oe_tenant_user', ['tenantId', 'userId'], {
      where: 'deleted_at IS NULL',
    }),
    (0, typeorm_1.Index)('idx_wfm_oe_tenant_site', ['tenantId', 'organizationSiteId'], {
      where: 'organization_site_id IS NOT NULL AND deleted_at IS NULL',
    }),
    (0, typeorm_1.Index)('idx_wfm_oe_tenant_time_range', ['tenantId', 'startsAt', 'endsAt'], {
      where: 'deleted_at IS NULL',
    }),
    (0, typeorm_1.Entity)({ name: 'wfm_operational_eventualities' }),
  ],
  WfmOperationalEventuality,
);
//# sourceMappingURL=wfm-operational-eventuality.entity.js.map
