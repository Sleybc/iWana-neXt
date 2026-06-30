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
exports.InventoryWriteOff = void 0;
const typeorm_1 = require('typeorm');
const shared_1 = require('@iwana/shared');
let InventoryWriteOff = class InventoryWriteOff {
  id;
  tenantId;
  serializedAssetId;
  itemId;
  reason;
  status;
  requestedByUserId;
  approvedByUserId;
  approvedAt;
  stockMovementId;
  notes;
  createdAt;
  updatedAt;
};
exports.InventoryWriteOff = InventoryWriteOff;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  InventoryWriteOff.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  InventoryWriteOff.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'serialized_asset_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  InventoryWriteOff.prototype,
  'serializedAssetId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'item_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  InventoryWriteOff.prototype,
  'itemId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      type: 'enum',
      enum: shared_1.WriteOffReason,
      enumName: 'write_off_reason',
    }),
    __metadata('design:type', String),
  ],
  InventoryWriteOff.prototype,
  'reason',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      type: 'enum',
      enum: shared_1.WriteOffStatus,
      enumName: 'write_off_status',
      default: shared_1.WriteOffStatus.REQUESTED,
    }),
    __metadata('design:type', String),
  ],
  InventoryWriteOff.prototype,
  'status',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'requested_by_user_id', type: 'uuid' }),
    __metadata('design:type', String),
  ],
  InventoryWriteOff.prototype,
  'requestedByUserId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'approved_by_user_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  InventoryWriteOff.prototype,
  'approvedByUserId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'approved_at', type: 'timestamptz', nullable: true }),
    __metadata('design:type', Object),
  ],
  InventoryWriteOff.prototype,
  'approvedAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'stock_movement_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  InventoryWriteOff.prototype,
  'stockMovementId',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'text', nullable: true }), __metadata('design:type', Object)],
  InventoryWriteOff.prototype,
  'notes',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  InventoryWriteOff.prototype,
  'createdAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  InventoryWriteOff.prototype,
  'updatedAt',
  void 0,
);
exports.InventoryWriteOff = InventoryWriteOff = __decorate(
  [
    (0, typeorm_1.Index)('idx_inventory_write_offs_tenant_status', ['tenantId', 'status']),
    (0, typeorm_1.Index)('idx_inventory_write_offs_tenant_approved_at', ['tenantId', 'approvedAt']),
    (0, typeorm_1.Entity)({ name: 'inventory_write_offs' }),
  ],
  InventoryWriteOff,
);
//# sourceMappingURL=inventory-write-off.entity.js.map
