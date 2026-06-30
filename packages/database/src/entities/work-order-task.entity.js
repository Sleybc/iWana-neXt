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
exports.WorkOrderTask = void 0;
const typeorm_1 = require('typeorm');
const shared_1 = require('@iwana/shared');
/**
 * Entidad WorkOrderTask — schema por tenant (dinamico via search_path).
 *
 * Tareas internas de una Work Order. En Fase 1 puede existir una tarea
 * por defecto; el modelo queda listo para multiples tareas.
 *
 * Sin @Entity({ schema }) — resuelto via SET LOCAL search_path (ADR-037, ADR-018).
 *
 * HLD-MOD09-PROGRAMACION-WFM-v1.0 §4, SPEC-MOD09 §6.3
 */
let WorkOrderTask = class WorkOrderTask {
  id;
  /** FK logica a public.tenants.id — sin FK referencial cross-schema */
  tenantId;
  /** Referencia a work_orders.id dentro del mismo schema tenant */
  workOrderId;
  title;
  description;
  status;
  /** Momento de llegada del tecnico registrado en campo */
  arrivalAt;
  /** Momento de salida del tecnico registrado en campo */
  departureAt;
  resultNotes;
  createdAt;
  updatedAt;
};
exports.WorkOrderTask = WorkOrderTask;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  WorkOrderTask.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  WorkOrderTask.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'work_order_id', type: 'uuid' }),
    __metadata('design:type', String),
  ],
  WorkOrderTask.prototype,
  'workOrderId',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'varchar', length: 160 }), __metadata('design:type', String)],
  WorkOrderTask.prototype,
  'title',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'text', nullable: true }), __metadata('design:type', Object)],
  WorkOrderTask.prototype,
  'description',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      type: 'enum',
      enum: shared_1.WorkOrderTaskStatus,
      default: shared_1.WorkOrderTaskStatus.PENDING,
    }),
    __metadata('design:type', String),
  ],
  WorkOrderTask.prototype,
  'status',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'arrival_at', type: 'timestamptz', nullable: true }),
    __metadata('design:type', Object),
  ],
  WorkOrderTask.prototype,
  'arrivalAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'departure_at', type: 'timestamptz', nullable: true }),
    __metadata('design:type', Object),
  ],
  WorkOrderTask.prototype,
  'departureAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'result_notes', type: 'text', nullable: true }),
    __metadata('design:type', Object),
  ],
  WorkOrderTask.prototype,
  'resultNotes',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  WorkOrderTask.prototype,
  'createdAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  WorkOrderTask.prototype,
  'updatedAt',
  void 0,
);
exports.WorkOrderTask = WorkOrderTask = __decorate(
  [
    (0, typeorm_1.Index)('idx_work_order_tasks_tenant_work_order', ['tenantId', 'workOrderId']),
    (0, typeorm_1.Entity)({ name: 'work_order_tasks' }), // Sin schema — resuelto via SET LOCAL search_path
  ],
  WorkOrderTask,
);
//# sourceMappingURL=work-order-task.entity.js.map
