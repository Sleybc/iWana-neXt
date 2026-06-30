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
exports.TicketPqrRecord = void 0;
const typeorm_1 = require('typeorm');
const shared_1 = require('@iwana/shared');
/**
 * Entidad TicketPqrRecord — schema por tenant (dinamico via search_path).
 *
 * Registro de plazos regulatorios CRC para tickets de tipo PQR.
 * Cada plazo (respuesta inicial, resolucion final, correccion) se registra
 * como una fila independiente para trazabilidad completa.
 *
 * HLD-MOD10-SERVICE-ASSURANCE-v1.0 §4
 */
let TicketPqrRecord = class TicketPqrRecord {
  id;
  /** FK logica a support_tickets.id — sin FK referencial */
  ticketId;
  tenantId;
  /** Numero de radicacion ante la CRC — null si aun no asignado */
  pqrNumber;
  deadlineType;
  deadlineAt;
  notifiedAt;
  resolvedAt;
  notes;
  createdAt;
  updatedAt;
};
exports.TicketPqrRecord = TicketPqrRecord;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  TicketPqrRecord.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'ticket_id', type: 'uuid' }), __metadata('design:type', String)],
  TicketPqrRecord.prototype,
  'ticketId',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  TicketPqrRecord.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'pqr_number', type: 'varchar', length: 50, nullable: true }),
    __metadata('design:type', Object),
  ],
  TicketPqrRecord.prototype,
  'pqrNumber',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'deadline_type', type: 'enum', enum: shared_1.PqrDeadlineType }),
    __metadata('design:type', String),
  ],
  TicketPqrRecord.prototype,
  'deadlineType',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'deadline_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  TicketPqrRecord.prototype,
  'deadlineAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'notified_at', type: 'timestamptz', nullable: true }),
    __metadata('design:type', Object),
  ],
  TicketPqrRecord.prototype,
  'notifiedAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'resolved_at', type: 'timestamptz', nullable: true }),
    __metadata('design:type', Object),
  ],
  TicketPqrRecord.prototype,
  'resolvedAt',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'text', nullable: true }), __metadata('design:type', Object)],
  TicketPqrRecord.prototype,
  'notes',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  TicketPqrRecord.prototype,
  'createdAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  TicketPqrRecord.prototype,
  'updatedAt',
  void 0,
);
exports.TicketPqrRecord = TicketPqrRecord = __decorate(
  [
    (0, typeorm_1.Index)('idx_ticket_pqr_records_ticket', ['ticketId']),
    (0, typeorm_1.Entity)({ name: 'ticket_pqr_records' }),
  ],
  TicketPqrRecord,
);
//# sourceMappingURL=ticket-pqr-record.entity.js.map
