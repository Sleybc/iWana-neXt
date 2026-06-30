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
exports.SupportTicket = void 0;
const typeorm_1 = require('typeorm');
const shared_1 = require('@iwana/shared');
/**
 * Entidad SupportTicket — schema por tenant (dinamico via search_path).
 *
 * Representa un ticket de soporte (incidente, PQR, solicitud de servicio) del modulo
 * Service Assurance / Mesa de Ayuda (MOD10).
 *
 * Sin @Entity({ schema }) — PostgreSQL resuelve via SET LOCAL search_path (ADR-038, ADR-018).
 * FK logicas: sin FK referenciales cross-table ni cross-schema.
 * Sin PII del suscriptor — solo IDs de referencia logica.
 *
 * HLD-MOD10-SERVICE-ASSURANCE-v1.0 §4
 */
let SupportTicket = class SupportTicket {
  id;
  /** FK logica a public.tenants.id — sin FK referencial cross-schema */
  tenantId;
  /** Codigo unico por tenant: TK-YYYYMMDD-NNN */
  ticketNumber;
  type;
  status;
  priority;
  source;
  subject;
  description;
  /** Tipo de solicitante — sin PII */
  requesterType;
  /** ID lógico del solicitante — puede referenciar subscriber, user, contractor, etc. */
  requesterRefId;
  /** Tipo del objeto afectado — sin FK cross-module */
  subjectType;
  /** ID lógico del objeto afectado — servicio, nodo, contrato, área interna, etc. */
  subjectRefId;
  /** Usuario asignado — referencia logica a users.id */
  assignedUserId;
  queueName;
  /** Referencia logica a la politica SLA aplicada */
  slaPolicyId;
  slaFirstResponseAt;
  slaResolveByAt;
  firstRespondedAt;
  resolvedAt;
  closedAt;
  slaBreachStatus;
  fieldDecision;
  /** Referencia logica a work_orders.id (WFM) — sin FK referencial */
  workOrderId;
  createdByUserId;
  createdAt;
  updatedAt;
};
exports.SupportTicket = SupportTicket;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  SupportTicket.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  SupportTicket.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'ticket_number', type: 'varchar', length: 30 }),
    __metadata('design:type', String),
  ],
  SupportTicket.prototype,
  'ticketNumber',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ type: 'enum', enum: shared_1.TicketType }),
    __metadata('design:type', String),
  ],
  SupportTicket.prototype,
  'type',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      type: 'enum',
      enum: shared_1.TicketStatus,
      default: shared_1.TicketStatus.OPEN,
    }),
    __metadata('design:type', String),
  ],
  SupportTicket.prototype,
  'status',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      type: 'enum',
      enum: shared_1.TicketPriority,
      default: shared_1.TicketPriority.NORMAL,
    }),
    __metadata('design:type', String),
  ],
  SupportTicket.prototype,
  'priority',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      type: 'enum',
      enum: shared_1.TicketSource,
      default: shared_1.TicketSource.MANUAL,
    }),
    __metadata('design:type', String),
  ],
  SupportTicket.prototype,
  'source',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'varchar', length: 200 }), __metadata('design:type', String)],
  SupportTicket.prototype,
  'subject',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'text', nullable: true }), __metadata('design:type', Object)],
  SupportTicket.prototype,
  'description',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'requester_type',
      type: 'enum',
      enum: shared_1.TicketRequesterType,
    }),
    __metadata('design:type', String),
  ],
  SupportTicket.prototype,
  'requesterType',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'requester_ref_id',
      type: 'varchar',
      length: 160,
      nullable: true,
    }),
    __metadata('design:type', Object),
  ],
  SupportTicket.prototype,
  'requesterRefId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'subject_type',
      type: 'enum',
      enum: shared_1.TicketSubjectType,
      nullable: true,
    }),
    __metadata('design:type', Object),
  ],
  SupportTicket.prototype,
  'subjectType',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'subject_ref_id', type: 'varchar', length: 160, nullable: true }),
    __metadata('design:type', Object),
  ],
  SupportTicket.prototype,
  'subjectRefId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'assigned_user_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  SupportTicket.prototype,
  'assignedUserId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'queue_name',
      type: 'enum',
      enum: shared_1.TicketQueue,
      nullable: true,
    }),
    __metadata('design:type', Object),
  ],
  SupportTicket.prototype,
  'queueName',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'sla_policy_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  SupportTicket.prototype,
  'slaPolicyId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'sla_first_response_at', type: 'timestamptz', nullable: true }),
    __metadata('design:type', Object),
  ],
  SupportTicket.prototype,
  'slaFirstResponseAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'sla_resolve_by_at', type: 'timestamptz', nullable: true }),
    __metadata('design:type', Object),
  ],
  SupportTicket.prototype,
  'slaResolveByAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'first_responded_at', type: 'timestamptz', nullable: true }),
    __metadata('design:type', Object),
  ],
  SupportTicket.prototype,
  'firstRespondedAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'resolved_at', type: 'timestamptz', nullable: true }),
    __metadata('design:type', Object),
  ],
  SupportTicket.prototype,
  'resolvedAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'closed_at', type: 'timestamptz', nullable: true }),
    __metadata('design:type', Object),
  ],
  SupportTicket.prototype,
  'closedAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'sla_breach_status',
      type: 'enum',
      enum: shared_1.SlaBreachStatus,
      default: shared_1.SlaBreachStatus.OK,
    }),
    __metadata('design:type', String),
  ],
  SupportTicket.prototype,
  'slaBreachStatus',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'field_decision',
      type: 'enum',
      enum: shared_1.TicketFieldDecision,
      default: shared_1.TicketFieldDecision.NOT_REQUIRED,
    }),
    __metadata('design:type', String),
  ],
  SupportTicket.prototype,
  'fieldDecision',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'work_order_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  SupportTicket.prototype,
  'workOrderId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'created_by_user_id', type: 'uuid' }),
    __metadata('design:type', String),
  ],
  SupportTicket.prototype,
  'createdByUserId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  SupportTicket.prototype,
  'createdAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  SupportTicket.prototype,
  'updatedAt',
  void 0,
);
exports.SupportTicket = SupportTicket = __decorate(
  [
    (0, typeorm_1.Index)('idx_support_tickets_tenant_status', ['tenantId', 'status']),
    (0, typeorm_1.Index)('idx_support_tickets_tenant_assignee', ['tenantId', 'assignedUserId'], {
      where: '"assigned_user_id" IS NOT NULL',
    }),
    (0, typeorm_1.Index)('idx_support_tickets_tenant_type', ['tenantId', 'type']),
    (0, typeorm_1.Index)('idx_support_tickets_tenant_created', ['tenantId', 'createdAt']),
    (0, typeorm_1.Index)('idx_support_tickets_tenant_requester', ['tenantId', 'requesterRefId'], {
      where: '"requester_ref_id" IS NOT NULL',
    }),
    (0, typeorm_1.Index)('idx_support_tickets_tenant_subject_ref', ['tenantId', 'subjectRefId'], {
      where: '"subject_ref_id" IS NOT NULL',
    }),
    (0, typeorm_1.Entity)({ name: 'support_tickets' }),
  ],
  SupportTicket,
);
//# sourceMappingURL=support-ticket.entity.js.map
