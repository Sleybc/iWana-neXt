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
exports.StockMovement = void 0;
const typeorm_1 = require('typeorm');
const shared_1 = require('@iwana/shared');
let StockMovement = class StockMovement {
  id;
  tenantId;
  movementNumber;
  origin;
  originContext;
  originRefId;
  idempotencyKey;
  notes;
  actorUserId;
  reversedByMovementId;
  isReversal;
  createdAt;
  updatedAt;
};
exports.StockMovement = StockMovement;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  StockMovement.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  StockMovement.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'movement_number', type: 'varchar', length: 40 }),
    __metadata('design:type', String),
  ],
  StockMovement.prototype,
  'movementNumber',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      type: 'enum',
      enum: shared_1.StockMovementOrigin,
      enumName: 'stock_movement_origin',
    }),
    __metadata('design:type', String),
  ],
  StockMovement.prototype,
  'origin',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'origin_context', type: 'varchar', length: 64 }),
    __metadata('design:type', String),
  ],
  StockMovement.prototype,
  'originContext',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'origin_ref_id', type: 'varchar', length: 160, nullable: true }),
    __metadata('design:type', Object),
  ],
  StockMovement.prototype,
  'originRefId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'idempotency_key', type: 'varchar', length: 160 }),
    __metadata('design:type', String),
  ],
  StockMovement.prototype,
  'idempotencyKey',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'text', nullable: true }), __metadata('design:type', Object)],
  StockMovement.prototype,
  'notes',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'actor_user_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  StockMovement.prototype,
  'actorUserId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'reversed_by_movement_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  StockMovement.prototype,
  'reversedByMovementId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'is_reversal', type: 'boolean', default: false }),
    __metadata('design:type', Boolean),
  ],
  StockMovement.prototype,
  'isReversal',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  StockMovement.prototype,
  'createdAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  StockMovement.prototype,
  'updatedAt',
  void 0,
);
exports.StockMovement = StockMovement = __decorate(
  [
    (0, typeorm_1.Index)(
      'uq_stock_movements_tenant_idempotency_key',
      ['tenantId', 'idempotencyKey'],
      {
        unique: true,
      },
    ),
    (0, typeorm_1.Index)('idx_stock_movements_tenant_created_at', ['tenantId', 'createdAt']),
    (0, typeorm_1.Index)('idx_stock_movements_tenant_origin', [
      'tenantId',
      'originContext',
      'originRefId',
    ]),
    (0, typeorm_1.Entity)({ name: 'stock_movements' }),
  ],
  StockMovement,
);
//# sourceMappingURL=stock-movement.entity.js.map
