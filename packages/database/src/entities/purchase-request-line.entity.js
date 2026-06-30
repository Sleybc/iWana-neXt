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
exports.PurchaseRequestLine = void 0;
const typeorm_1 = require('typeorm');
const shared_1 = require('@iwana/shared');
let PurchaseRequestLine = class PurchaseRequestLine {
  id;
  tenantId;
  purchaseRequestId;
  sourceKind;
  inventoryItemId;
  freeTextDescription;
  quantityRequested;
  unitOfMeasure;
  suggestedPartyRefId;
  lineStatus;
  notes;
  createdAt;
  updatedAt;
};
exports.PurchaseRequestLine = PurchaseRequestLine;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  PurchaseRequestLine.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  PurchaseRequestLine.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'purchase_request_id', type: 'uuid' }),
    __metadata('design:type', String),
  ],
  PurchaseRequestLine.prototype,
  'purchaseRequestId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'source_kind',
      type: 'enum',
      enum: shared_1.PurchaseRequestLineSourceKind,
      enumName: 'purchase_request_line_source_kind',
    }),
    __metadata('design:type', String),
  ],
  PurchaseRequestLine.prototype,
  'sourceKind',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'inventory_item_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  PurchaseRequestLine.prototype,
  'inventoryItemId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'free_text_description',
      type: 'varchar',
      length: 500,
      nullable: true,
    }),
    __metadata('design:type', Object),
  ],
  PurchaseRequestLine.prototype,
  'freeTextDescription',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'quantity_requested', type: 'numeric', precision: 12, scale: 2 }),
    __metadata('design:type', String),
  ],
  PurchaseRequestLine.prototype,
  'quantityRequested',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'unit_of_measure', type: 'varchar', length: 32 }),
    __metadata('design:type', String),
  ],
  PurchaseRequestLine.prototype,
  'unitOfMeasure',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'suggested_party_ref_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  PurchaseRequestLine.prototype,
  'suggestedPartyRefId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'line_status',
      type: 'enum',
      enum: shared_1.PurchaseRequestLineStatus,
      enumName: 'purchase_request_line_status',
      default: shared_1.PurchaseRequestLineStatus.OPEN,
    }),
    __metadata('design:type', String),
  ],
  PurchaseRequestLine.prototype,
  'lineStatus',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'text', nullable: true }), __metadata('design:type', Object)],
  PurchaseRequestLine.prototype,
  'notes',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  PurchaseRequestLine.prototype,
  'createdAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  PurchaseRequestLine.prototype,
  'updatedAt',
  void 0,
);
exports.PurchaseRequestLine = PurchaseRequestLine = __decorate(
  [
    (0, typeorm_1.Index)('idx_purchase_request_lines_tenant_request', [
      'tenantId',
      'purchaseRequestId',
    ]),
    (0, typeorm_1.Index)('idx_purchase_request_lines_tenant_status', ['tenantId', 'lineStatus']),
    (0, typeorm_1.Index)('idx_purchase_request_lines_tenant_item', ['tenantId', 'inventoryItemId']),
    (0, typeorm_1.Entity)({ name: 'purchase_request_lines' }),
  ],
  PurchaseRequestLine,
);
//# sourceMappingURL=purchase-request-line.entity.js.map
