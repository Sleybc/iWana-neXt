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
exports.WorkOrder = void 0;
const typeorm_1 = require('typeorm');
const shared_1 = require('@iwana/shared');
/**
 * Entidad WorkOrder — schema por tenant (dinamico via search_path).
 *
 * Orden operativa ligera vinculada a un evento de agenda.
 * Puede originarse desde CRM, Service Assurance, Provisioning o manualmente.
 *
 * `code` es unico por tenant via indice parcial en la migracion.
 * Sin @Entity({ schema }) — resuelto via SET LOCAL search_path (ADR-037, ADR-018).
 *
 * HLD-MOD09-PROGRAMACION-WFM-v1.0 §4, SPEC-MOD09 §6.2
 */
let WorkOrder = class WorkOrder {
  id;
  /** FK logica a public.tenants.id — sin FK referencial cross-schema */
  tenantId;
  /** Consecutivo legible, ej. WO-20260506-001 — unicidad por tenant via constraint en migracion */
  code;
  type;
  status;
  priority;
  /** ID del tecnico responsable (ref logica a users.id) */
  assignedUserId;
  /**
   * Vinculo inverso para lectura rapida desde la OT.
   * No debe mutarse de forma independiente: `ScheduleEvent.workOrderId` es la
   * referencia canonica y la capa de servicios debe mantener ambos campos
   * sincronizados dentro de la misma transaccion tenant-aware.
   */
  scheduledEventId;
  sourceContext;
  /** ID externo o referencia semantica del sistema origen */
  sourceRef;
  summary;
  notes;
  createdBy;
  closedBy;
  closedAt;
  createdAt;
  updatedAt;
  deletedAt;
};
exports.WorkOrder = WorkOrder;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  WorkOrder.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  WorkOrder.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'varchar', length: 40 }), __metadata('design:type', String)],
  WorkOrder.prototype,
  'code',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ type: 'enum', enum: shared_1.WfmWorkType }),
    __metadata('design:type', String),
  ],
  WorkOrder.prototype,
  'type',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      type: 'enum',
      enum: shared_1.WorkOrderStatus,
      default: shared_1.WorkOrderStatus.OPEN,
    }),
    __metadata('design:type', String),
  ],
  WorkOrder.prototype,
  'status',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      type: 'enum',
      enum: shared_1.WorkOrderPriority,
      default: shared_1.WorkOrderPriority.NORMAL,
    }),
    __metadata('design:type', String),
  ],
  WorkOrder.prototype,
  'priority',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'assigned_user_id', type: 'uuid' }),
    __metadata('design:type', String),
  ],
  WorkOrder.prototype,
  'assignedUserId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'scheduled_event_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  WorkOrder.prototype,
  'scheduledEventId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'source_context',
      type: 'enum',
      enum: shared_1.WorkOrderSourceContext,
    }),
    __metadata('design:type', String),
  ],
  WorkOrder.prototype,
  'sourceContext',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'source_ref', type: 'varchar', length: 160, nullable: true }),
    __metadata('design:type', Object),
  ],
  WorkOrder.prototype,
  'sourceRef',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'varchar', length: 200 }), __metadata('design:type', String)],
  WorkOrder.prototype,
  'summary',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'text', nullable: true }), __metadata('design:type', Object)],
  WorkOrder.prototype,
  'notes',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'created_by', type: 'uuid' }), __metadata('design:type', String)],
  WorkOrder.prototype,
  'createdBy',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'closed_by', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  WorkOrder.prototype,
  'closedBy',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'closed_at', type: 'timestamptz', nullable: true }),
    __metadata('design:type', Object),
  ],
  WorkOrder.prototype,
  'closedAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  WorkOrder.prototype,
  'createdAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  WorkOrder.prototype,
  'updatedAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.DeleteDateColumn)({ name: 'deleted_at', type: 'timestamptz' }),
    __metadata('design:type', Object),
  ],
  WorkOrder.prototype,
  'deletedAt',
  void 0,
);
exports.WorkOrder = WorkOrder = __decorate(
  [
    (0, typeorm_1.Index)('uq_work_orders_tenant_code', ['tenantId', 'code'], {
      unique: true,
      where: '"deleted_at" IS NULL',
    }),
    (0, typeorm_1.Index)('idx_work_orders_tenant_status', ['tenantId', 'status'], {
      where: '"deleted_at" IS NULL',
    }),
    (0, typeorm_1.Index)('idx_work_orders_tenant_assigned', ['tenantId', 'assignedUserId'], {
      where: '"deleted_at" IS NULL',
    }),
    (0, typeorm_1.Entity)({ name: 'work_orders' }), // Sin schema — resuelto via SET LOCAL search_path
  ],
  WorkOrder,
);
//# sourceMappingURL=work-order.entity.js.map
