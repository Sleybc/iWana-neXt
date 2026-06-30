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
exports.OperationalTask = void 0;
const typeorm_1 = require('typeorm');
const shared_1 = require('@iwana/shared');
/**
 * Entidad OperationalTask — schema por tenant (dinamico via search_path).
 * Owner MOD11: trabajo ejecutable transversal con responsable y destinatario explicitos.
 */
let OperationalTask = class OperationalTask {
  id;
  tenantId;
  taskNumber;
  type;
  status;
  priority;
  title;
  description;
  originContext;
  originRefId;
  ticketId;
  responsibleType;
  responsibleRefId;
  recipientType;
  recipientRefId;
  recipientLabel;
  queueName;
  executionMode;
  dueAt;
  scheduledRequired;
  scheduleEventId;
  workOrderId;
  createdByUserId;
  resolvedAt;
  closedAt;
  createdAt;
  updatedAt;
};
exports.OperationalTask = OperationalTask;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  OperationalTask.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  OperationalTask.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'task_number', type: 'varchar', length: 30 }),
    __metadata('design:type', String),
  ],
  OperationalTask.prototype,
  'taskNumber',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ type: 'enum', enum: shared_1.TaskType, enumName: 'task_type' }),
    __metadata('design:type', String),
  ],
  OperationalTask.prototype,
  'type',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      type: 'enum',
      enum: shared_1.TaskStatus,
      enumName: 'task_status',
      default: shared_1.TaskStatus.OPEN,
    }),
    __metadata('design:type', String),
  ],
  OperationalTask.prototype,
  'status',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      type: 'enum',
      enum: shared_1.TaskPriority,
      enumName: 'task_priority',
      default: shared_1.TaskPriority.NORMAL,
    }),
    __metadata('design:type', String),
  ],
  OperationalTask.prototype,
  'priority',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'varchar', length: 200 }), __metadata('design:type', String)],
  OperationalTask.prototype,
  'title',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'text', nullable: true }), __metadata('design:type', Object)],
  OperationalTask.prototype,
  'description',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'origin_context',
      type: 'enum',
      enum: shared_1.TaskOriginContext,
      enumName: 'task_origin_context',
    }),
    __metadata('design:type', String),
  ],
  OperationalTask.prototype,
  'originContext',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'origin_ref_id', type: 'varchar', length: 160, nullable: true }),
    __metadata('design:type', Object),
  ],
  OperationalTask.prototype,
  'originRefId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'ticket_id', type: 'varchar', length: 160, nullable: true }),
    __metadata('design:type', Object),
  ],
  OperationalTask.prototype,
  'ticketId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'responsible_type',
      type: 'enum',
      enum: shared_1.TaskResponsibleType,
      enumName: 'task_responsible_type',
    }),
    __metadata('design:type', String),
  ],
  OperationalTask.prototype,
  'responsibleType',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'responsible_ref_id', type: 'varchar', length: 160 }),
    __metadata('design:type', String),
  ],
  OperationalTask.prototype,
  'responsibleRefId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'recipient_type',
      type: 'enum',
      enum: shared_1.TaskRecipientType,
      enumName: 'task_recipient_type',
    }),
    __metadata('design:type', String),
  ],
  OperationalTask.prototype,
  'recipientType',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'recipient_ref_id',
      type: 'varchar',
      length: 160,
      nullable: true,
    }),
    __metadata('design:type', Object),
  ],
  OperationalTask.prototype,
  'recipientRefId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'recipient_label',
      type: 'varchar',
      length: 160,
      nullable: true,
    }),
    __metadata('design:type', Object),
  ],
  OperationalTask.prototype,
  'recipientLabel',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'queue_name', type: 'varchar', length: 80, nullable: true }),
    __metadata('design:type', Object),
  ],
  OperationalTask.prototype,
  'queueName',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'execution_mode',
      type: 'enum',
      enum: shared_1.TaskExecutionMode,
      enumName: 'task_execution_mode',
    }),
    __metadata('design:type', String),
  ],
  OperationalTask.prototype,
  'executionMode',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'due_at', type: 'timestamptz', nullable: true }),
    __metadata('design:type', Object),
  ],
  OperationalTask.prototype,
  'dueAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'scheduled_required', type: 'boolean', default: false }),
    __metadata('design:type', Boolean),
  ],
  OperationalTask.prototype,
  'scheduledRequired',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'schedule_event_id',
      type: 'varchar',
      length: 160,
      nullable: true,
    }),
    __metadata('design:type', Object),
  ],
  OperationalTask.prototype,
  'scheduleEventId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'work_order_id', type: 'varchar', length: 160, nullable: true }),
    __metadata('design:type', Object),
  ],
  OperationalTask.prototype,
  'workOrderId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'created_by_user_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  OperationalTask.prototype,
  'createdByUserId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'resolved_at', type: 'timestamptz', nullable: true }),
    __metadata('design:type', Object),
  ],
  OperationalTask.prototype,
  'resolvedAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'closed_at', type: 'timestamptz', nullable: true }),
    __metadata('design:type', Object),
  ],
  OperationalTask.prototype,
  'closedAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  OperationalTask.prototype,
  'createdAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  OperationalTask.prototype,
  'updatedAt',
  void 0,
);
exports.OperationalTask = OperationalTask = __decorate(
  [
    (0, typeorm_1.Index)('uq_operational_tasks_tenant_number', ['tenantId', 'taskNumber'], {
      unique: true,
    }),
    (0, typeorm_1.Index)('idx_operational_tasks_tenant_status', ['tenantId', 'status']),
    (0, typeorm_1.Index)('idx_operational_tasks_tenant_responsible', [
      'tenantId',
      'responsibleRefId',
    ]),
    (0, typeorm_1.Index)('idx_operational_tasks_tenant_recipient', ['tenantId', 'recipientRefId']),
    (0, typeorm_1.Index)('idx_operational_tasks_tenant_origin', [
      'tenantId',
      'originContext',
      'originRefId',
    ]),
    (0, typeorm_1.Index)('idx_operational_tasks_tenant_due_at', ['tenantId', 'dueAt']),
    (0, typeorm_1.Entity)({ name: 'operational_tasks' }),
  ],
  OperationalTask,
);
//# sourceMappingURL=operational-task.entity.js.map
