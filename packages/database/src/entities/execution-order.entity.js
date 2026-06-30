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
exports.ExecutionOrder = void 0;
const typeorm_1 = require('typeorm');
const shared_1 = require('@iwana/shared');
let ExecutionOrder = class ExecutionOrder {
  id;
  tenantId;
  executionOrderNumber;
  visitRequestId;
  scheduleEventId;
  assignedTechnicianId;
  assignedCrewId;
  originContext;
  originRefId;
  customerDisplayLabel;
  serviceAddress;
  municipality;
  sector;
  workType;
  workSummary;
  workInstructions;
  plannedWindowStartAt;
  plannedWindowEndAt;
  status;
  result;
  startedAt;
  closedAt;
  closeNotes;
  createdByUserId;
  updatedByUserId;
  createdAt;
  updatedAt;
};
exports.ExecutionOrder = ExecutionOrder;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  ExecutionOrder.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  ExecutionOrder.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'execution_order_number', type: 'varchar', length: 40 }),
    __metadata('design:type', String),
  ],
  ExecutionOrder.prototype,
  'executionOrderNumber',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'visit_request_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  ExecutionOrder.prototype,
  'visitRequestId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'schedule_event_id', type: 'uuid' }),
    __metadata('design:type', String),
  ],
  ExecutionOrder.prototype,
  'scheduleEventId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'assigned_technician_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  ExecutionOrder.prototype,
  'assignedTechnicianId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'assigned_crew_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  ExecutionOrder.prototype,
  'assignedCrewId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'origin_context', type: 'varchar', length: 64 }),
    __metadata('design:type', String),
  ],
  ExecutionOrder.prototype,
  'originContext',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'origin_ref_id', type: 'varchar', length: 160, nullable: true }),
    __metadata('design:type', Object),
  ],
  ExecutionOrder.prototype,
  'originRefId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'customer_display_label', type: 'varchar', length: 200 }),
    __metadata('design:type', String),
  ],
  ExecutionOrder.prototype,
  'customerDisplayLabel',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'service_address',
      type: 'varchar',
      length: 255,
      nullable: true,
    }),
    __metadata('design:type', Object),
  ],
  ExecutionOrder.prototype,
  'serviceAddress',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ type: 'varchar', length: 120, nullable: true }),
    __metadata('design:type', Object),
  ],
  ExecutionOrder.prototype,
  'municipality',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ type: 'varchar', length: 120, nullable: true }),
    __metadata('design:type', Object),
  ],
  ExecutionOrder.prototype,
  'sector',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'work_type',
      type: 'enum',
      enum: shared_1.WfmWorkType,
      enumName: 'wfm_work_type',
    }),
    __metadata('design:type', String),
  ],
  ExecutionOrder.prototype,
  'workType',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'work_summary', type: 'varchar', length: 200 }),
    __metadata('design:type', String),
  ],
  ExecutionOrder.prototype,
  'workSummary',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'work_instructions', type: 'text', nullable: true }),
    __metadata('design:type', Object),
  ],
  ExecutionOrder.prototype,
  'workInstructions',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'planned_window_start_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  ExecutionOrder.prototype,
  'plannedWindowStartAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'planned_window_end_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  ExecutionOrder.prototype,
  'plannedWindowEndAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      type: 'enum',
      enum: shared_1.ExecutionOrderStatus,
      enumName: 'execution_order_status',
      default: shared_1.ExecutionOrderStatus.CREATED,
    }),
    __metadata('design:type', String),
  ],
  ExecutionOrder.prototype,
  'status',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      type: 'enum',
      enum: shared_1.ExecutionOrderResult,
      enumName: 'execution_order_result',
      nullable: true,
    }),
    __metadata('design:type', Object),
  ],
  ExecutionOrder.prototype,
  'result',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'started_at', type: 'timestamptz', nullable: true }),
    __metadata('design:type', Object),
  ],
  ExecutionOrder.prototype,
  'startedAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'closed_at', type: 'timestamptz', nullable: true }),
    __metadata('design:type', Object),
  ],
  ExecutionOrder.prototype,
  'closedAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'close_notes', type: 'text', nullable: true }),
    __metadata('design:type', Object),
  ],
  ExecutionOrder.prototype,
  'closeNotes',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'created_by_user_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  ExecutionOrder.prototype,
  'createdByUserId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'updated_by_user_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  ExecutionOrder.prototype,
  'updatedByUserId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  ExecutionOrder.prototype,
  'createdAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  ExecutionOrder.prototype,
  'updatedAt',
  void 0,
);
exports.ExecutionOrder = ExecutionOrder = __decorate(
  [
    (0, typeorm_1.Index)(
      'uq_execution_orders_tenant_number',
      ['tenantId', 'executionOrderNumber'],
      { unique: true },
    ),
    (0, typeorm_1.Index)('idx_execution_orders_tenant_status', ['tenantId', 'status']),
    (0, typeorm_1.Index)('idx_execution_orders_tenant_schedule_event', [
      'tenantId',
      'scheduleEventId',
    ]),
    (0, typeorm_1.Index)('idx_execution_orders_tenant_assigned_technician', [
      'tenantId',
      'assignedTechnicianId',
    ]),
    (0, typeorm_1.Entity)({ name: 'execution_orders' }),
  ],
  ExecutionOrder,
);
//# sourceMappingURL=execution-order.entity.js.map
