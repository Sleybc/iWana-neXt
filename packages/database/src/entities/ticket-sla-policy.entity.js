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
exports.TicketSlaPolicy = void 0;
const typeorm_1 = require('typeorm');
/**
 * Entidad TicketSlaPolicy — schema por tenant (dinamico via search_path).
 *
 * Politica de SLA configurable por tenant. Puede aplicarse a un tipo de ticket
 * especifico, una prioridad especifica, o ambos. La politica mas especifica gana.
 *
 * HLD-MOD10-SERVICE-ASSURANCE-v1.0 §4
 */
let TicketSlaPolicy = class TicketSlaPolicy {
  id;
  tenantId;
  name;
  /** Tipo de ticket al que aplica (valor de TicketType como string) — null = cualquiera */
  appliesToType;
  /** Prioridad a la que aplica (valor de TicketPriority como string) — null = cualquiera */
  appliesToPriority;
  /** Minutos para primera respuesta desde creacion */
  firstResponseMinutes;
  /** Minutos para resolucion desde creacion */
  resolutionMinutes;
  isActive;
  createdAt;
  updatedAt;
};
exports.TicketSlaPolicy = TicketSlaPolicy;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  TicketSlaPolicy.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  TicketSlaPolicy.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'varchar', length: 100 }), __metadata('design:type', String)],
  TicketSlaPolicy.prototype,
  'name',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'applies_to_type', type: 'varchar', length: 50, nullable: true }),
    __metadata('design:type', Object),
  ],
  TicketSlaPolicy.prototype,
  'appliesToType',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'applies_to_priority',
      type: 'varchar',
      length: 50,
      nullable: true,
    }),
    __metadata('design:type', Object),
  ],
  TicketSlaPolicy.prototype,
  'appliesToPriority',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'first_response_minutes', type: 'int' }),
    __metadata('design:type', Number),
  ],
  TicketSlaPolicy.prototype,
  'firstResponseMinutes',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'resolution_minutes', type: 'int' }),
    __metadata('design:type', Number),
  ],
  TicketSlaPolicy.prototype,
  'resolutionMinutes',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'is_active', type: 'boolean', default: true }),
    __metadata('design:type', Boolean),
  ],
  TicketSlaPolicy.prototype,
  'isActive',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  TicketSlaPolicy.prototype,
  'createdAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  TicketSlaPolicy.prototype,
  'updatedAt',
  void 0,
);
exports.TicketSlaPolicy = TicketSlaPolicy = __decorate(
  [
    (0, typeorm_1.Index)('idx_ticket_sla_policies_tenant', ['tenantId']),
    (0, typeorm_1.Entity)({ name: 'ticket_sla_policies' }),
  ],
  TicketSlaPolicy,
);
//# sourceMappingURL=ticket-sla-policy.entity.js.map
