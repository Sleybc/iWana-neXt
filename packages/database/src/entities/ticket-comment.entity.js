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
exports.TicketComment = void 0;
const typeorm_1 = require('typeorm');
/**
 * Entidad TicketComment — schema por tenant (dinamico via search_path).
 *
 * Comentarios internos y externos de un ticket de soporte.
 * Entidad append-only: sin soft-delete ni UpdateDateColumn.
 *
 * HLD-MOD10-SERVICE-ASSURANCE-v1.0 §4
 */
let TicketComment = class TicketComment {
  id;
  /** FK logica a support_tickets.id — sin FK referencial */
  ticketId;
  tenantId;
  body;
  /** Comentario interno: no visible al solicitante externo */
  isInternal;
  /** Autor del comentario — referencia logica a users.id */
  authorUserId;
  createdAt;
};
exports.TicketComment = TicketComment;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  TicketComment.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'ticket_id', type: 'uuid' }), __metadata('design:type', String)],
  TicketComment.prototype,
  'ticketId',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  TicketComment.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'text' }), __metadata('design:type', String)],
  TicketComment.prototype,
  'body',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'is_internal', type: 'boolean', default: false }),
    __metadata('design:type', Boolean),
  ],
  TicketComment.prototype,
  'isInternal',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'author_user_id', type: 'uuid' }),
    __metadata('design:type', String),
  ],
  TicketComment.prototype,
  'authorUserId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  TicketComment.prototype,
  'createdAt',
  void 0,
);
exports.TicketComment = TicketComment = __decorate(
  [
    (0, typeorm_1.Index)('idx_ticket_comments_ticket', ['ticketId']),
    (0, typeorm_1.Entity)({ name: 'ticket_comments' }),
  ],
  TicketComment,
);
//# sourceMappingURL=ticket-comment.entity.js.map
