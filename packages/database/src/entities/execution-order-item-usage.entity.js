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
exports.ExecutionOrderItemUsage = void 0;
const typeorm_1 = require('typeorm');
const shared_1 = require('@iwana/shared');
let ExecutionOrderItemUsage = class ExecutionOrderItemUsage {
  id;
  executionOrderId;
  tenantId;
  itemId;
  technicianCustodyId;
  quantity;
  serialNumber;
  action;
  finalDisposition;
  stockMovementId;
  actorUserId;
  createdAt;
};
exports.ExecutionOrderItemUsage = ExecutionOrderItemUsage;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  ExecutionOrderItemUsage.prototype,
  'id',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'execution_order_id', type: 'uuid' }),
    __metadata('design:type', String),
  ],
  ExecutionOrderItemUsage.prototype,
  'executionOrderId',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  ExecutionOrderItemUsage.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'item_id', type: 'varchar', length: 160 }),
    __metadata('design:type', String),
  ],
  ExecutionOrderItemUsage.prototype,
  'itemId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'technician_custody_id', type: 'varchar', length: 160 }),
    __metadata('design:type', String),
  ],
  ExecutionOrderItemUsage.prototype,
  'technicianCustodyId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ type: 'numeric', precision: 12, scale: 2, default: 1 }),
    __metadata('design:type', String),
  ],
  ExecutionOrderItemUsage.prototype,
  'quantity',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'serial_number', type: 'varchar', length: 160, nullable: true }),
    __metadata('design:type', Object),
  ],
  ExecutionOrderItemUsage.prototype,
  'serialNumber',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      type: 'enum',
      enum: shared_1.ExecutionOrderItemAction,
      enumName: 'execution_order_item_action',
    }),
    __metadata('design:type', String),
  ],
  ExecutionOrderItemUsage.prototype,
  'action',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'final_disposition',
      type: 'enum',
      enum: shared_1.InventoryDisposition,
      enumName: 'inventory_disposition',
    }),
    __metadata('design:type', String),
  ],
  ExecutionOrderItemUsage.prototype,
  'finalDisposition',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'stock_movement_id',
      type: 'varchar',
      length: 160,
      nullable: true,
    }),
    __metadata('design:type', Object),
  ],
  ExecutionOrderItemUsage.prototype,
  'stockMovementId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'actor_user_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  ExecutionOrderItemUsage.prototype,
  'actorUserId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  ExecutionOrderItemUsage.prototype,
  'createdAt',
  void 0,
);
exports.ExecutionOrderItemUsage = ExecutionOrderItemUsage = __decorate(
  [
    (0, typeorm_1.Index)('idx_execution_order_item_usage_order', ['executionOrderId', 'createdAt']),
    (0, typeorm_1.Entity)({ name: 'execution_order_item_usage' }),
  ],
  ExecutionOrderItemUsage,
);
//# sourceMappingURL=execution-order-item-usage.entity.js.map
