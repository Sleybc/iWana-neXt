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
exports.TicketWorkOrderLink = void 0;
const typeorm_1 = require('typeorm');
/**
 * Entidad TicketWorkOrderLink — schema por tenant (dinamico via search_path).
 *
 * Registro del vinculo entre un ticket de soporte y una Work Order de WFM.
 * Referencia logica — sin FK referencial cross-module.
 * Entidad append-only: la solicitud de campo queda trazada permanentemente.
 *
 * HLD-MOD10-SERVICE-ASSURANCE-v1.0 §4
 */
let TicketWorkOrderLink = class TicketWorkOrderLink {
  id;
  /** FK logica a support_tickets.id — sin FK referencial */
  ticketId;
  tenantId;
  /** Referencia logica a work_orders.id (WFM) — sin FK referencial cross-module */
  workOrderId;
  requestedAt;
  requestedByUserId;
  notes;
  createdAt;
};
exports.TicketWorkOrderLink = TicketWorkOrderLink;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  TicketWorkOrderLink.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'ticket_id', type: 'uuid' }), __metadata('design:type', String)],
  TicketWorkOrderLink.prototype,
  'ticketId',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  TicketWorkOrderLink.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'work_order_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  TicketWorkOrderLink.prototype,
  'workOrderId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'requested_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  TicketWorkOrderLink.prototype,
  'requestedAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'requested_by_user_id', type: 'uuid' }),
    __metadata('design:type', String),
  ],
  TicketWorkOrderLink.prototype,
  'requestedByUserId',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'text', nullable: true }), __metadata('design:type', Object)],
  TicketWorkOrderLink.prototype,
  'notes',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  TicketWorkOrderLink.prototype,
  'createdAt',
  void 0,
);
exports.TicketWorkOrderLink = TicketWorkOrderLink = __decorate(
  [
    (0, typeorm_1.Index)('idx_ticket_wo_links_ticket', ['ticketId']),
    (0, typeorm_1.Entity)({ name: 'ticket_work_order_links' }),
  ],
  TicketWorkOrderLink,
);
//# sourceMappingURL=ticket-work-order-link.entity.js.map
