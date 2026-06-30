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
exports.StockLot = void 0;
const typeorm_1 = require('typeorm');
let StockLot = class StockLot {
  id;
  tenantId;
  itemId;
  lotNumber;
  expiryDate;
  goodsReceiptId;
  createdAt;
  updatedAt;
};
exports.StockLot = StockLot;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  StockLot.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  StockLot.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'item_id', type: 'uuid' }), __metadata('design:type', String)],
  StockLot.prototype,
  'itemId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'lot_number', type: 'varchar', length: 80 }),
    __metadata('design:type', String),
  ],
  StockLot.prototype,
  'lotNumber',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'expiry_date', type: 'date', nullable: true }),
    __metadata('design:type', Object),
  ],
  StockLot.prototype,
  'expiryDate',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'goods_receipt_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  StockLot.prototype,
  'goodsReceiptId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  StockLot.prototype,
  'createdAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  StockLot.prototype,
  'updatedAt',
  void 0,
);
exports.StockLot = StockLot = __decorate(
  [
    (0, typeorm_1.Index)('idx_stock_lots_tenant_item_lot', ['tenantId', 'itemId', 'lotNumber']),
    (0, typeorm_1.Index)('idx_stock_lots_tenant_expiry', ['tenantId', 'expiryDate']),
    (0, typeorm_1.Entity)({ name: 'stock_lots' }),
  ],
  StockLot,
);
//# sourceMappingURL=stock-lot.entity.js.map
