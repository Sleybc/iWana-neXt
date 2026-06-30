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
exports.OrganizationCompanyBusinessHours = void 0;
const typeorm_1 = require('typeorm');
const shared_1 = require('@iwana/shared');
/**
 * Horario base de atención y recaudo a nivel empresa.
 * Una fila por tenant_id + weekday.
 * Si is_open = false, opens_at y closes_at son null.
 * Si is_open = true, opens_at < closes_at.
 *
 * MOD00 — Configuración / Organización — Horario base empresa
 */
let OrganizationCompanyBusinessHours = class OrganizationCompanyBusinessHours {
  id;
  tenantId;
  weekday;
  opensAt;
  closesAt;
  isOpen;
  createdAt;
  updatedAt;
};
exports.OrganizationCompanyBusinessHours = OrganizationCompanyBusinessHours;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  OrganizationCompanyBusinessHours.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  OrganizationCompanyBusinessHours.prototype,
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
  OrganizationCompanyBusinessHours.prototype,
  'weekday',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'opens_at', type: 'time', nullable: true }),
    __metadata('design:type', Object),
  ],
  OrganizationCompanyBusinessHours.prototype,
  'opensAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'closes_at', type: 'time', nullable: true }),
    __metadata('design:type', Object),
  ],
  OrganizationCompanyBusinessHours.prototype,
  'closesAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'is_open', type: 'boolean', default: true }),
    __metadata('design:type', Boolean),
  ],
  OrganizationCompanyBusinessHours.prototype,
  'isOpen',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  OrganizationCompanyBusinessHours.prototype,
  'createdAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  OrganizationCompanyBusinessHours.prototype,
  'updatedAt',
  void 0,
);
exports.OrganizationCompanyBusinessHours = OrganizationCompanyBusinessHours = __decorate(
  [
    (0, typeorm_1.Index)('uq_org_company_business_hours_tenant_weekday', ['tenantId', 'weekday'], {
      unique: true,
    }),
    (0, typeorm_1.Index)('idx_org_company_business_hours_tenant', ['tenantId']),
    (0, typeorm_1.Entity)({ name: 'organization_company_business_hours' }),
  ],
  OrganizationCompanyBusinessHours,
);
//# sourceMappingURL=organization-company-business-hours.entity.js.map
