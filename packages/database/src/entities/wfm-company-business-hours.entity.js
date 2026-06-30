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
exports.WfmCompanyBusinessHours = void 0;
const typeorm_1 = require('typeorm');
const shared_1 = require('@iwana/shared');
let WfmCompanyBusinessHours = class WfmCompanyBusinessHours {
  id;
  tenantId;
  weekday;
  startTime;
  endTime;
  isEnabled;
  createdAt;
  updatedAt;
};
exports.WfmCompanyBusinessHours = WfmCompanyBusinessHours;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  WfmCompanyBusinessHours.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  WfmCompanyBusinessHours.prototype,
  'tenantId',
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
  WfmCompanyBusinessHours.prototype,
  'weekday',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'start_time', type: 'time', nullable: true }),
    __metadata('design:type', Object),
  ],
  WfmCompanyBusinessHours.prototype,
  'startTime',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'end_time', type: 'time', nullable: true }),
    __metadata('design:type', Object),
  ],
  WfmCompanyBusinessHours.prototype,
  'endTime',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'is_enabled', type: 'boolean', default: true }),
    __metadata('design:type', Boolean),
  ],
  WfmCompanyBusinessHours.prototype,
  'isEnabled',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  WfmCompanyBusinessHours.prototype,
  'createdAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  WfmCompanyBusinessHours.prototype,
  'updatedAt',
  void 0,
);
exports.WfmCompanyBusinessHours = WfmCompanyBusinessHours = __decorate(
  [
    (0, typeorm_1.Index)('uq_wfm_company_business_hours_tenant_weekday', ['tenantId', 'weekday'], {
      unique: true,
    }),
    (0, typeorm_1.Entity)({ name: 'wfm_company_business_hours' }),
  ],
  WfmCompanyBusinessHours,
);
//# sourceMappingURL=wfm-company-business-hours.entity.js.map
