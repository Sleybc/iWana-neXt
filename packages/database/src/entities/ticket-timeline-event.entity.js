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
exports.TicketTimelineEvent = void 0;
const typeorm_1 = require('typeorm');
const shared_1 = require('@iwana/shared');
/**
 * Entidad TicketTimelineEvent — schema por tenant (dinamico via search_path).
 *
 * Registro append-only de eventos del ciclo de vida de un ticket.
 * Sin soft-delete, sin UpdateDateColumn — la timeline es inmutable.
 *
 * HLD-MOD10-SERVICE-ASSURANCE-v1.0 §4
 */
let TicketTimelineEvent = class TicketTimelineEvent {
  id;
  /** FK logica a support_tickets.id — sin FK referencial */
  ticketId;
  tenantId;
  eventType;
  /** Datos adicionales del evento — estructura libre segun eventType */
  payload;
  /** Usuario que origino el evento — null si fue automatico */
  actorUserId;
  occurredAt;
};
exports.TicketTimelineEvent = TicketTimelineEvent;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  TicketTimelineEvent.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'ticket_id', type: 'uuid' }), __metadata('design:type', String)],
  TicketTimelineEvent.prototype,
  'ticketId',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  TicketTimelineEvent.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'event_type',
      type: 'enum',
      enum: shared_1.TicketTimelineEventType,
    }),
    __metadata('design:type', String),
  ],
  TicketTimelineEvent.prototype,
  'eventType',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'jsonb', default: {} }), __metadata('design:type', Object)],
  TicketTimelineEvent.prototype,
  'payload',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'actor_user_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  TicketTimelineEvent.prototype,
  'actorUserId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'occurred_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  TicketTimelineEvent.prototype,
  'occurredAt',
  void 0,
);
exports.TicketTimelineEvent = TicketTimelineEvent = __decorate(
  [
    (0, typeorm_1.Index)('idx_ticket_timeline_ticket', ['ticketId', 'occurredAt']),
    (0, typeorm_1.Entity)({ name: 'ticket_timeline_events' }),
  ],
  TicketTimelineEvent,
);
//# sourceMappingURL=ticket-timeline-event.entity.js.map
