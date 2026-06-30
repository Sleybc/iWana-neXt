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
exports.GoodsReceipt = void 0;
const typeorm_1 = require('typeorm');
const shared_1 = require('@iwana/shared');
let GoodsReceipt = class GoodsReceipt {
  id;
  tenantId;
  receiptNumber;
  purchaseOrderId;
  status;
  receivedAt;
  receivedByUserId;
  notes;
  createdAt;
  updatedAt;
};
exports.GoodsReceipt = GoodsReceipt;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  GoodsReceipt.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  GoodsReceipt.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'receipt_number', type: 'varchar', length: 40 }),
    __metadata('design:type', String),
  ],
  GoodsReceipt.prototype,
  'receiptNumber',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'purchase_order_id', type: 'uuid' }),
    __metadata('design:type', String),
  ],
  GoodsReceipt.prototype,
  'purchaseOrderId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      type: 'enum',
      enum: shared_1.GoodsReceiptStatus,
      enumName: 'goods_receipt_status',
      default: shared_1.GoodsReceiptStatus.DRAFT,
    }),
    __metadata('design:type', String),
  ],
  GoodsReceipt.prototype,
  'status',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'received_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  GoodsReceipt.prototype,
  'receivedAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'received_by_user_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  GoodsReceipt.prototype,
  'receivedByUserId',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'text', nullable: true }), __metadata('design:type', Object)],
  GoodsReceipt.prototype,
  'notes',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  GoodsReceipt.prototype,
  'createdAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  GoodsReceipt.prototype,
  'updatedAt',
  void 0,
);
exports.GoodsReceipt = GoodsReceipt = __decorate(
  [
    (0, typeorm_1.Index)('idx_goods_receipts_tenant_po_date', [
      'tenantId',
      'purchaseOrderId',
      'receivedAt',
    ]),
    (0, typeorm_1.Entity)({ name: 'goods_receipts' }),
  ],
  GoodsReceipt,
);
//# sourceMappingURL=goods-receipt.entity.js.map
