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
exports.OrganizationBusinessHoursException = void 0;
const typeorm_1 = require('typeorm');
/**
 * Excepciones de horario por fecha para Organization.
 * Permite modelar festivos, cierres especiales y aperturas extraordinarias.
 *
 * - organization_site_id = null: aplica a toda la empresa.
 * - organization_site_id = <uuid>: aplica solo a esa sede.
 * - is_recurring = true: se repite cada año en el mismo mes/día (mm-dd).
 * - is_open = false: cierre total por festivo o novedad.
 * - is_open = true: apertura o ajuste extraordinario.
 *
 * MOD00 — Configuración / Organización — Excepciones por fecha
 */
let OrganizationBusinessHoursException = class OrganizationBusinessHoursException {
  id;
  tenantId;
  organizationSiteId;
  /**
   * Fecha de la excepción en formato ISO 8601 YYYY-MM-DD.
   * Para excepciones recurrentes, el año puede ser 2000 como convenio o cualquier año.
   * La comparación de recurrencia usa solo mm-dd.
   */
  exceptionDate;
  isRecurring;
  isOpen;
  opensAt;
  closesAt;
  name;
  description;
  createdAt;
  updatedAt;
};
exports.OrganizationBusinessHoursException = OrganizationBusinessHoursException;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  OrganizationBusinessHoursException.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  OrganizationBusinessHoursException.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'organization_site_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  OrganizationBusinessHoursException.prototype,
  'organizationSiteId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'exception_date', type: 'date' }),
    __metadata('design:type', String),
  ],
  OrganizationBusinessHoursException.prototype,
  'exceptionDate',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'is_recurring', type: 'boolean', default: false }),
    __metadata('design:type', Boolean),
  ],
  OrganizationBusinessHoursException.prototype,
  'isRecurring',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'is_open', type: 'boolean', default: false }),
    __metadata('design:type', Boolean),
  ],
  OrganizationBusinessHoursException.prototype,
  'isOpen',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'opens_at', type: 'time', nullable: true }),
    __metadata('design:type', Object),
  ],
  OrganizationBusinessHoursException.prototype,
  'opensAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'closes_at', type: 'time', nullable: true }),
    __metadata('design:type', Object),
  ],
  OrganizationBusinessHoursException.prototype,
  'closesAt',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'varchar', length: 160 }), __metadata('design:type', String)],
  OrganizationBusinessHoursException.prototype,
  'name',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'text', nullable: true }), __metadata('design:type', Object)],
  OrganizationBusinessHoursException.prototype,
  'description',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  OrganizationBusinessHoursException.prototype,
  'createdAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  OrganizationBusinessHoursException.prototype,
  'updatedAt',
  void 0,
);
exports.OrganizationBusinessHoursException = OrganizationBusinessHoursException = __decorate(
  [
    (0, typeorm_1.Index)('idx_org_bh_exceptions_tenant', ['tenantId']),
    (0, typeorm_1.Index)('idx_org_bh_exceptions_tenant_date', ['tenantId', 'exceptionDate']),
    (0, typeorm_1.Index)('idx_org_bh_exceptions_tenant_site', ['tenantId', 'organizationSiteId']),
    (0, typeorm_1.Entity)({ name: 'organization_business_hours_exceptions' }),
  ],
  OrganizationBusinessHoursException,
);
//# sourceMappingURL=organization-business-hours-exception.entity.js.map
