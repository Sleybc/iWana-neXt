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
exports.WfmHolidayBlackout = void 0;
const typeorm_1 = require('typeorm');
let WfmHolidayBlackout = class WfmHolidayBlackout {
  id;
  tenantId;
  organizationSiteId;
  blackoutDate;
  isRecurring;
  name;
  description;
  isEnabled;
  createdAt;
  updatedAt;
};
exports.WfmHolidayBlackout = WfmHolidayBlackout;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  WfmHolidayBlackout.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  WfmHolidayBlackout.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'organization_site_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  WfmHolidayBlackout.prototype,
  'organizationSiteId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'blackout_date', type: 'date' }),
    __metadata('design:type', String),
  ],
  WfmHolidayBlackout.prototype,
  'blackoutDate',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'is_recurring', type: 'boolean', default: false }),
    __metadata('design:type', Boolean),
  ],
  WfmHolidayBlackout.prototype,
  'isRecurring',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'varchar', length: 120 }), __metadata('design:type', String)],
  WfmHolidayBlackout.prototype,
  'name',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ type: 'varchar', length: 255, nullable: true }),
    __metadata('design:type', Object),
  ],
  WfmHolidayBlackout.prototype,
  'description',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'is_enabled', type: 'boolean', default: true }),
    __metadata('design:type', Boolean),
  ],
  WfmHolidayBlackout.prototype,
  'isEnabled',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  WfmHolidayBlackout.prototype,
  'createdAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  WfmHolidayBlackout.prototype,
  'updatedAt',
  void 0,
);
exports.WfmHolidayBlackout = WfmHolidayBlackout = __decorate(
  [
    (0, typeorm_1.Index)('idx_wfm_holiday_blackouts_tenant_date', ['tenantId', 'blackoutDate']),
    (0, typeorm_1.Index)('idx_wfm_holiday_blackouts_tenant_org_site_date', [
      'tenantId',
      'organizationSiteId',
      'blackoutDate',
    ]),
    (0, typeorm_1.Entity)({ name: 'wfm_holiday_blackouts' }),
  ],
  WfmHolidayBlackout,
);
//# sourceMappingURL=wfm-holiday-blackout.entity.js.map
