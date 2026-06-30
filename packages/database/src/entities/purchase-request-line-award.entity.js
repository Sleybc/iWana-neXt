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
exports.PurchaseRequestLineAward = void 0;
const typeorm_1 = require('typeorm');
let PurchaseRequestLineAward = class PurchaseRequestLineAward {
  id;
  tenantId;
  purchaseRequestLineId;
  supplierQuoteId;
  awardedPartyRefId;
  awardedQuantity;
  awardNotes;
  createdAt;
  updatedAt;
};
exports.PurchaseRequestLineAward = PurchaseRequestLineAward;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  PurchaseRequestLineAward.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  PurchaseRequestLineAward.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'purchase_request_line_id', type: 'uuid' }),
    __metadata('design:type', String),
  ],
  PurchaseRequestLineAward.prototype,
  'purchaseRequestLineId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'supplier_quote_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  PurchaseRequestLineAward.prototype,
  'supplierQuoteId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'awarded_party_ref_id', type: 'uuid' }),
    __metadata('design:type', String),
  ],
  PurchaseRequestLineAward.prototype,
  'awardedPartyRefId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'awarded_quantity', type: 'numeric', precision: 12, scale: 2 }),
    __metadata('design:type', String),
  ],
  PurchaseRequestLineAward.prototype,
  'awardedQuantity',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'award_notes', type: 'text', nullable: true }),
    __metadata('design:type', Object),
  ],
  PurchaseRequestLineAward.prototype,
  'awardNotes',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  PurchaseRequestLineAward.prototype,
  'createdAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  PurchaseRequestLineAward.prototype,
  'updatedAt',
  void 0,
);
exports.PurchaseRequestLineAward = PurchaseRequestLineAward = __decorate(
  [
    (0, typeorm_1.Index)('idx_purchase_request_line_awards_tenant_line', [
      'tenantId',
      'purchaseRequestLineId',
    ]),
    (0, typeorm_1.Index)('idx_purchase_request_line_awards_tenant_party', [
      'tenantId',
      'awardedPartyRefId',
    ]),
    (0, typeorm_1.Entity)({ name: 'purchase_request_line_awards' }),
  ],
  PurchaseRequestLineAward,
);
//# sourceMappingURL=purchase-request-line-award.entity.js.map
