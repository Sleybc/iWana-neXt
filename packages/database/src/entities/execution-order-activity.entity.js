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
exports.ExecutionOrderActivity = void 0;
const typeorm_1 = require('typeorm');
let ExecutionOrderActivity = class ExecutionOrderActivity {
  id;
  executionOrderId;
  tenantId;
  activityType;
  description;
  actorUserId;
  createdAt;
};
exports.ExecutionOrderActivity = ExecutionOrderActivity;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  ExecutionOrderActivity.prototype,
  'id',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'execution_order_id', type: 'uuid' }),
    __metadata('design:type', String),
  ],
  ExecutionOrderActivity.prototype,
  'executionOrderId',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  ExecutionOrderActivity.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'activity_type', type: 'varchar', length: 64 }),
    __metadata('design:type', String),
  ],
  ExecutionOrderActivity.prototype,
  'activityType',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'text' }), __metadata('design:type', String)],
  ExecutionOrderActivity.prototype,
  'description',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'actor_user_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  ExecutionOrderActivity.prototype,
  'actorUserId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  ExecutionOrderActivity.prototype,
  'createdAt',
  void 0,
);
exports.ExecutionOrderActivity = ExecutionOrderActivity = __decorate(
  [
    (0, typeorm_1.Index)('idx_execution_order_activities_order', ['executionOrderId', 'createdAt']),
    (0, typeorm_1.Entity)({ name: 'execution_order_activities' }),
  ],
  ExecutionOrderActivity,
);
//# sourceMappingURL=execution-order-activity.entity.js.map
