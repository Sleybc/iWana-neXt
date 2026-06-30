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
exports.VisitRequest = void 0;
const typeorm_1 = require('typeorm');
const shared_1 = require('@iwana/shared');
/**
 * Entidad VisitRequest — schema por tenant (dinamico via search_path).
 *
 * Solicitud operativa inicial que origina la creacion de Work Orders y ScheduleEvents.
 * Captura la demanda, contexto de origen, prioridad y datos del solicitante antes de
 * pasar a programacion WFM.
 *
 * Puede generarse desde CRM, Service Assurance, Provisioning o flujos manuales.
 * Status PENDING → NEEDS_CONTEXT → READY_TO_SCHEDULE → SCHEDULED | CANCELLED | REJECTED
 *
 * Sin @Entity({ schema }) — resuelto via SET LOCAL search_path (ADR-037, ADR-018).
 *
 * HLD-MOD09-PROGRAMACION-WFM-v1.0 §4, SPEC-MOD09 §6.2
 */
let VisitRequest = class VisitRequest {
  id;
  /** FK logica a public.tenants.id — sin FK referencial cross-schema */
  tenantId;
  status;
  /** Contexto de origen — sistema que solicita la visita */
  originContext;
  /** ID externo o referencia semantica del sistema origen */
  originRef;
  /** Etiqueta legible del sistema origen (ej. "Ticket #123", "Expediente EXP-001") */
  originLabel;
  workType;
  priority;
  title;
  description;
  /** Inicio de la ventana temporal solicitada por el negocio */
  requestedWindowStartAt;
  /** Fin de la ventana temporal solicitada por el negocio */
  requestedWindowEndAt;
  /** Fecha limite de atencion por SLA del negocio */
  slaDueAt;
  /** Sede organizacional sugerida o seleccionada; opcional para tenants monosede */
  organizationSiteId;
  address;
  municipality;
  sector;
  latitude;
  longitude;
  /** FK logica a expediente_records.id — vinculo opcional de contexto CRM */
  expedienteId;
  /** FK logica a subscribers.id — vinculo opcional de contexto CRM */
  subscriberId;
  /** ID externo de ticket en Service Assurance — vinculo opcional */
  ticketId;
  /** FK logica a contracts.id — vinculo opcional de contexto comercial */
  contractId;
  /** ScheduleEvent generado al programar la visita — vinculo bidireccional */
  scheduleEventId;
  /** WorkOrder generada al programar la visita — vinculo bidireccional */
  workOrderId;
  /** ExecutionOrder generada al confirmar agenda — referencia logica MOD11 */
  executionOrderId;
  /** Usuario que creo la solicitud */
  requestedByUserId;
  /** Usuario que agendo la visita (cuando status = SCHEDULED) */
  scheduledByUserId;
  /** Timestamp de agendamiento (cuando status = SCHEDULED) */
  scheduledAt;
  /** Timestamp de cancelacion (cuando status = CANCELLED) */
  cancelledAt;
  /** Usuario que cancelo la solicitud */
  cancelledByUserId;
  /** Motivo de cancelacion */
  cancelReason;
  createdAt;
  updatedAt;
  deletedAt;
};
exports.VisitRequest = VisitRequest;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  VisitRequest.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  VisitRequest.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ type: 'enum', enum: shared_1.VisitRequestStatus }),
    __metadata('design:type', String),
  ],
  VisitRequest.prototype,
  'status',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'origin_context',
      type: 'enum',
      enum: shared_1.WorkOrderSourceContext,
    }),
    __metadata('design:type', String),
  ],
  VisitRequest.prototype,
  'originContext',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'origin_ref', type: 'varchar', length: 160, nullable: true }),
    __metadata('design:type', Object),
  ],
  VisitRequest.prototype,
  'originRef',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'origin_label', type: 'varchar', length: 160, nullable: true }),
    __metadata('design:type', Object),
  ],
  VisitRequest.prototype,
  'originLabel',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'work_type', type: 'enum', enum: shared_1.WfmWorkType }),
    __metadata('design:type', String),
  ],
  VisitRequest.prototype,
  'workType',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ type: 'enum', enum: shared_1.WorkOrderPriority }),
    __metadata('design:type', String),
  ],
  VisitRequest.prototype,
  'priority',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'varchar', length: 160 }), __metadata('design:type', String)],
  VisitRequest.prototype,
  'title',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'text', nullable: true }), __metadata('design:type', Object)],
  VisitRequest.prototype,
  'description',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'requested_window_start_at',
      type: 'timestamptz',
      nullable: true,
    }),
    __metadata('design:type', Object),
  ],
  VisitRequest.prototype,
  'requestedWindowStartAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'requested_window_end_at', type: 'timestamptz', nullable: true }),
    __metadata('design:type', Object),
  ],
  VisitRequest.prototype,
  'requestedWindowEndAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'sla_due_at', type: 'timestamptz', nullable: true }),
    __metadata('design:type', Object),
  ],
  VisitRequest.prototype,
  'slaDueAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'organization_site_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  VisitRequest.prototype,
  'organizationSiteId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ type: 'varchar', length: 255, nullable: true }),
    __metadata('design:type', Object),
  ],
  VisitRequest.prototype,
  'address',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ type: 'varchar', length: 120, nullable: true }),
    __metadata('design:type', Object),
  ],
  VisitRequest.prototype,
  'municipality',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ type: 'varchar', length: 120, nullable: true }),
    __metadata('design:type', Object),
  ],
  VisitRequest.prototype,
  'sector',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ type: 'numeric', precision: 10, scale: 7, nullable: true }),
    __metadata('design:type', Object),
  ],
  VisitRequest.prototype,
  'latitude',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ type: 'numeric', precision: 10, scale: 7, nullable: true }),
    __metadata('design:type', Object),
  ],
  VisitRequest.prototype,
  'longitude',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'expediente_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  VisitRequest.prototype,
  'expedienteId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'subscriber_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  VisitRequest.prototype,
  'subscriberId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'ticket_id', type: 'varchar', length: 160, nullable: true }),
    __metadata('design:type', Object),
  ],
  VisitRequest.prototype,
  'ticketId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'contract_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  VisitRequest.prototype,
  'contractId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'schedule_event_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  VisitRequest.prototype,
  'scheduleEventId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'work_order_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  VisitRequest.prototype,
  'workOrderId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'execution_order_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  VisitRequest.prototype,
  'executionOrderId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'requested_by_user_id', type: 'uuid' }),
    __metadata('design:type', String),
  ],
  VisitRequest.prototype,
  'requestedByUserId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'scheduled_by_user_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  VisitRequest.prototype,
  'scheduledByUserId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'scheduled_at', type: 'timestamptz', nullable: true }),
    __metadata('design:type', Object),
  ],
  VisitRequest.prototype,
  'scheduledAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'cancelled_at', type: 'timestamptz', nullable: true }),
    __metadata('design:type', Object),
  ],
  VisitRequest.prototype,
  'cancelledAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'cancelled_by_user_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  VisitRequest.prototype,
  'cancelledByUserId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'cancel_reason', type: 'varchar', length: 200, nullable: true }),
    __metadata('design:type', Object),
  ],
  VisitRequest.prototype,
  'cancelReason',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  VisitRequest.prototype,
  'createdAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  VisitRequest.prototype,
  'updatedAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.DeleteDateColumn)({ name: 'deleted_at', type: 'timestamptz' }),
    __metadata('design:type', Object),
  ],
  VisitRequest.prototype,
  'deletedAt',
  void 0,
);
exports.VisitRequest = VisitRequest = __decorate(
  [
    (0, typeorm_1.Index)('idx_visit_requests_tenant_status_created', [
      'tenantId',
      'status',
      'createdAt',
    ]),
    (0, typeorm_1.Entity)({ name: 'visit_requests' }), // Sin schema — resuelto via SET LOCAL search_path
  ],
  VisitRequest,
);
//# sourceMappingURL=visit-request.entity.js.map
