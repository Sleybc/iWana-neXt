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
exports.TechnicianAvailability = void 0;
const typeorm_1 = require('typeorm');
const shared_1 = require('@iwana/shared');
/**
 * Entidad TechnicianAvailability — schema por tenant (dinamico via search_path).
 *
 * Cubre bloqueos manuales y disponibilidad puntual por tecnico o contratista.
 * Horarios recurrentes se difieren a Fase 2 segun alcance aprobado.
 *
 * Sin @Entity({ schema }) — resuelto via SET LOCAL search_path (ADR-037, ADR-018).
 *
 * HLD-MOD09-PROGRAMACION-WFM-v1.0 §4, SPEC-MOD09 §6.5
 */
let TechnicianAvailability = class TechnicianAvailability {
  id;
  /** FK logica a public.tenants.id — sin FK referencial cross-schema */
  tenantId;
  /** ID del tecnico o contratista (ref logica a users.id) */
  userId;
  type;
  startsAt;
  endsAt;
  reason;
  createdBy;
  createdAt;
  updatedAt;
};
exports.TechnicianAvailability = TechnicianAvailability;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  TechnicianAvailability.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  TechnicianAvailability.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'user_id', type: 'uuid' }), __metadata('design:type', String)],
  TechnicianAvailability.prototype,
  'userId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ type: 'enum', enum: shared_1.TechnicianAvailabilityType }),
    __metadata('design:type', String),
  ],
  TechnicianAvailability.prototype,
  'type',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'starts_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  TechnicianAvailability.prototype,
  'startsAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'ends_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  TechnicianAvailability.prototype,
  'endsAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ type: 'varchar', length: 160, nullable: true }),
    __metadata('design:type', Object),
  ],
  TechnicianAvailability.prototype,
  'reason',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'created_by', type: 'uuid' }), __metadata('design:type', String)],
  TechnicianAvailability.prototype,
  'createdBy',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  TechnicianAvailability.prototype,
  'createdAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  TechnicianAvailability.prototype,
  'updatedAt',
  void 0,
);
exports.TechnicianAvailability = TechnicianAvailability = __decorate(
  [
    (0, typeorm_1.Index)('idx_technician_availability_tenant_user', ['tenantId', 'userId']),
    (0, typeorm_1.Index)('idx_technician_availability_tenant_range', [
      'tenantId',
      'startsAt',
      'endsAt',
    ]),
    (0, typeorm_1.Entity)({ name: 'technician_availability' }), // Sin schema — resuelto via SET LOCAL search_path
  ],
  TechnicianAvailability,
);
//# sourceMappingURL=technician-availability.entity.js.map
