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
exports.GoodsReceiptLine = void 0;
const typeorm_1 = require('typeorm');
let GoodsReceiptLine = class GoodsReceiptLine {
  id;
  tenantId;
  goodsReceiptId;
  purchaseOrderLineId;
  itemId;
  quantityReceived;
  lotId;
  createdAt;
  updatedAt;
};
exports.GoodsReceiptLine = GoodsReceiptLine;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  GoodsReceiptLine.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  GoodsReceiptLine.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'goods_receipt_id', type: 'uuid' }),
    __metadata('design:type', String),
  ],
  GoodsReceiptLine.prototype,
  'goodsReceiptId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'purchase_order_line_id', type: 'uuid' }),
    __metadata('design:type', String),
  ],
  GoodsReceiptLine.prototype,
  'purchaseOrderLineId',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'item_id', type: 'uuid' }), __metadata('design:type', String)],
  GoodsReceiptLine.prototype,
  'itemId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'quantity_received', type: 'numeric', precision: 12, scale: 2 }),
    __metadata('design:type', String),
  ],
  GoodsReceiptLine.prototype,
  'quantityReceived',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'lot_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  GoodsReceiptLine.prototype,
  'lotId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  GoodsReceiptLine.prototype,
  'createdAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  GoodsReceiptLine.prototype,
  'updatedAt',
  void 0,
);
exports.GoodsReceiptLine = GoodsReceiptLine = __decorate(
  [
    (0, typeorm_1.Index)('idx_goods_receipt_lines_receipt', ['goodsReceiptId', 'createdAt']),
    (0, typeorm_1.Entity)({ name: 'goods_receipt_lines' }),
  ],
  GoodsReceiptLine,
);
//# sourceMappingURL=goods-receipt-line.entity.js.map
