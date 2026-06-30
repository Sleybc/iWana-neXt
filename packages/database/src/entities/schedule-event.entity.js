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
exports.ScheduleEvent = void 0;
const typeorm_1 = require('typeorm');
const shared_1 = require('@iwana/shared');
/**
 * Entidad ScheduleEvent — schema por tenant (dinamico via search_path).
 *
 * Representa un evento programado en la agenda operativa del ISP.
 * Puede vincularse opcionalmente a una WorkOrder, expediente, suscriptor,
 * ticket, contrato u otras referencias cross-module por ID logico.
 *
 * Sin @Entity({ schema }) — TypeORM genera referencias sin calificar.
 * PostgreSQL las resuelve via SET LOCAL search_path al inicio de cada
 * transaccion (ADR-037, ADR-018).
 *
 * HLD-MOD09-PROGRAMACION-WFM-v1.0 §4, SPEC-MOD09 §6.1
 */
let ScheduleEvent = class ScheduleEvent {
  id;
  /** FK logica a public.tenants.id — sin FK referencial cross-schema */
  tenantId;
  /**
   * Referencia canonica a work_orders.id dentro del mismo schema tenant.
   * La capa de servicios debe sincronizar este campo con `WorkOrder.scheduledEventId`
   * en la misma transaccion para evitar drift entre ambos lados de la relacion.
   */
  workOrderId;
  executionOrderId;
  type;
  status;
  title;
  description;
  scheduledStartAt;
  scheduledEndAt;
  /** ID del usuario tecnico, soporte, NOC o contratista asignado (ref logica a users.id) */
  assignedUserId;
  /** Reservado para cuadrillas futuras */
  assignedTeamId;
  /** Sede organizacional desde donde se atiende la agenda; opcional */
  organizationSiteId;
  address;
  municipality;
  sector;
  latitude;
  longitude;
  /** Vinculo CRM — referencia logica a expediente_records.id */
  expedienteId;
  /** Vinculo suscriptor — referencia logica a subscribers.id */
  subscriberId;
  /** Vinculo Service Assurance o referencia externa; puede ser ID o codigo semantico */
  ticketId;
  /** Vinculo contrato — referencia logica a contracts.id */
  contractId;
  createdBy;
  updatedBy;
  createdAt;
  updatedAt;
  deletedAt;
};
exports.ScheduleEvent = ScheduleEvent;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  ScheduleEvent.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  ScheduleEvent.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'work_order_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  ScheduleEvent.prototype,
  'workOrderId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'execution_order_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  ScheduleEvent.prototype,
  'executionOrderId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ type: 'enum', enum: shared_1.WfmWorkType }),
    __metadata('design:type', String),
  ],
  ScheduleEvent.prototype,
  'type',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      type: 'enum',
      enum: shared_1.ScheduleEventStatus,
      default: shared_1.ScheduleEventStatus.DRAFT,
    }),
    __metadata('design:type', String),
  ],
  ScheduleEvent.prototype,
  'status',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'varchar', length: 160 }), __metadata('design:type', String)],
  ScheduleEvent.prototype,
  'title',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'text', nullable: true }), __metadata('design:type', Object)],
  ScheduleEvent.prototype,
  'description',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'scheduled_start_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  ScheduleEvent.prototype,
  'scheduledStartAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'scheduled_end_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  ScheduleEvent.prototype,
  'scheduledEndAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'assigned_user_id', type: 'uuid' }),
    __metadata('design:type', String),
  ],
  ScheduleEvent.prototype,
  'assignedUserId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'assigned_team_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  ScheduleEvent.prototype,
  'assignedTeamId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'organization_site_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  ScheduleEvent.prototype,
  'organizationSiteId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ type: 'varchar', length: 255, nullable: true }),
    __metadata('design:type', Object),
  ],
  ScheduleEvent.prototype,
  'address',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ type: 'varchar', length: 120, nullable: true }),
    __metadata('design:type', Object),
  ],
  ScheduleEvent.prototype,
  'municipality',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ type: 'varchar', length: 120, nullable: true }),
    __metadata('design:type', Object),
  ],
  ScheduleEvent.prototype,
  'sector',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ type: 'numeric', precision: 10, scale: 7, nullable: true }),
    __metadata('design:type', Object),
  ],
  ScheduleEvent.prototype,
  'latitude',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ type: 'numeric', precision: 10, scale: 7, nullable: true }),
    __metadata('design:type', Object),
  ],
  ScheduleEvent.prototype,
  'longitude',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'expediente_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  ScheduleEvent.prototype,
  'expedienteId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'subscriber_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  ScheduleEvent.prototype,
  'subscriberId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'ticket_id', type: 'varchar', length: 160, nullable: true }),
    __metadata('design:type', Object),
  ],
  ScheduleEvent.prototype,
  'ticketId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'contract_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  ScheduleEvent.prototype,
  'contractId',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'created_by', type: 'uuid' }), __metadata('design:type', String)],
  ScheduleEvent.prototype,
  'createdBy',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'updated_by', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  ScheduleEvent.prototype,
  'updatedBy',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  ScheduleEvent.prototype,
  'createdAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  ScheduleEvent.prototype,
  'updatedAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.DeleteDateColumn)({ name: 'deleted_at', type: 'timestamptz' }),
    __metadata('design:type', Object),
  ],
  ScheduleEvent.prototype,
  'deletedAt',
  void 0,
);
exports.ScheduleEvent = ScheduleEvent = __decorate(
  [
    (0, typeorm_1.Index)('idx_schedule_events_tenant_start', ['tenantId', 'scheduledStartAt'], {
      where: '"deleted_at" IS NULL',
    }),
    (0, typeorm_1.Index)(
      'idx_schedule_events_tenant_assigned_start',
      ['tenantId', 'assignedUserId', 'scheduledStartAt'],
      {
        where: '"deleted_at" IS NULL',
      },
    ),
    (0, typeorm_1.Index)(
      'idx_schedule_events_tenant_status_start',
      ['tenantId', 'status', 'scheduledStartAt'],
      {
        where: '"deleted_at" IS NULL',
      },
    ),
    (0, typeorm_1.Index)('idx_schedule_events_tenant_expediente', ['tenantId', 'expedienteId'], {
      where: '"expediente_id" IS NOT NULL AND "deleted_at" IS NULL',
    }),
    (0, typeorm_1.Index)('idx_schedule_events_tenant_ticket', ['tenantId', 'ticketId'], {
      where: '"ticket_id" IS NOT NULL AND "deleted_at" IS NULL',
    }),
    (0, typeorm_1.Entity)({ name: 'schedule_events' }), // Sin schema — resuelto via SET LOCAL search_path
  ],
  ScheduleEvent,
);
//# sourceMappingURL=schedule-event.entity.js.map
