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
exports.PurchaseOrderLine = void 0;
const typeorm_1 = require('typeorm');
let PurchaseOrderLine = class PurchaseOrderLine {
  id;
  tenantId;
  purchaseOrderId;
  itemId;
  purchaseRequestLineId;
  quantity;
  unitCost;
  receivedQuantity;
  createdAt;
  updatedAt;
};
exports.PurchaseOrderLine = PurchaseOrderLine;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  PurchaseOrderLine.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  PurchaseOrderLine.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'purchase_order_id', type: 'uuid' }),
    __metadata('design:type', String),
  ],
  PurchaseOrderLine.prototype,
  'purchaseOrderId',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'item_id', type: 'uuid' }), __metadata('design:type', String)],
  PurchaseOrderLine.prototype,
  'itemId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'purchase_request_line_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  PurchaseOrderLine.prototype,
  'purchaseRequestLineId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ type: 'numeric', precision: 12, scale: 2 }),
    __metadata('design:type', String),
  ],
  PurchaseOrderLine.prototype,
  'quantity',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'unit_cost', type: 'numeric', precision: 14, scale: 2 }),
    __metadata('design:type', String),
  ],
  PurchaseOrderLine.prototype,
  'unitCost',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'received_quantity',
      type: 'numeric',
      precision: 12,
      scale: 2,
      default: 0,
    }),
    __metadata('design:type', String),
  ],
  PurchaseOrderLine.prototype,
  'receivedQuantity',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  PurchaseOrderLine.prototype,
  'createdAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  PurchaseOrderLine.prototype,
  'updatedAt',
  void 0,
);
exports.PurchaseOrderLine = PurchaseOrderLine = __decorate(
  [
    (0, typeorm_1.Index)('idx_purchase_order_lines_order', ['purchaseOrderId', 'createdAt']),
    (0, typeorm_1.Index)('idx_purchase_order_lines_tenant_request_line', [
      'tenantId',
      'purchaseRequestLineId',
    ]),
    (0, typeorm_1.Entity)({ name: 'purchase_order_lines' }),
  ],
  PurchaseOrderLine,
);
//# sourceMappingURL=purchase-order-line.entity.js.map
