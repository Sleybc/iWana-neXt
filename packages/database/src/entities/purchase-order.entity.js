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
exports.PurchaseOrder = void 0;
const typeorm_1 = require('typeorm');
const shared_1 = require('@iwana/shared');
let PurchaseOrder = class PurchaseOrder {
  id;
  tenantId;
  orderNumber;
  purchaseRequestId;
  partyRefId;
  status;
  expectedDeliveryDate;
  approvedByUserId;
  notes;
  createdAt;
  updatedAt;
};
exports.PurchaseOrder = PurchaseOrder;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  PurchaseOrder.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  PurchaseOrder.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'order_number', type: 'varchar', length: 40 }),
    __metadata('design:type', String),
  ],
  PurchaseOrder.prototype,
  'orderNumber',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'purchase_request_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  PurchaseOrder.prototype,
  'purchaseRequestId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'party_ref_id', type: 'uuid' }),
    __metadata('design:type', String),
  ],
  PurchaseOrder.prototype,
  'partyRefId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      type: 'enum',
      enum: shared_1.PurchaseOrderStatus,
      enumName: 'purchase_order_status',
      default: shared_1.PurchaseOrderStatus.DRAFT,
    }),
    __metadata('design:type', String),
  ],
  PurchaseOrder.prototype,
  'status',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'expected_delivery_date', type: 'date', nullable: true }),
    __metadata('design:type', Object),
  ],
  PurchaseOrder.prototype,
  'expectedDeliveryDate',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'approved_by_user_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  PurchaseOrder.prototype,
  'approvedByUserId',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'text', nullable: true }), __metadata('design:type', Object)],
  PurchaseOrder.prototype,
  'notes',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  PurchaseOrder.prototype,
  'createdAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  PurchaseOrder.prototype,
  'updatedAt',
  void 0,
);
exports.PurchaseOrder = PurchaseOrder = __decorate(
  [
    (0, typeorm_1.Index)('uq_purchase_orders_tenant_order_number', ['tenantId', 'orderNumber'], {
      unique: true,
    }),
    (0, typeorm_1.Index)('idx_purchase_orders_tenant_supplier', ['tenantId', 'partyRefId']),
    (0, typeorm_1.Index)('idx_purchase_orders_tenant_status', ['tenantId', 'status']),
    (0, typeorm_1.Index)('idx_purchase_orders_tenant_expected_delivery', [
      'tenantId',
      'expectedDeliveryDate',
    ]),
    (0, typeorm_1.Entity)({ name: 'purchase_orders' }),
  ],
  PurchaseOrder,
);
//# sourceMappingURL=purchase-order.entity.js.map
