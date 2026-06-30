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
exports.SupplierQuote = void 0;
const typeorm_1 = require('typeorm');
let SupplierQuote = class SupplierQuote {
  id;
  tenantId;
  purchaseRequestId;
  partyRefId;
  quoteNumber;
  amount;
  currency;
  validUntil;
  notes;
  createdAt;
  updatedAt;
};
exports.SupplierQuote = SupplierQuote;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  SupplierQuote.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  SupplierQuote.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'purchase_request_id', type: 'uuid' }),
    __metadata('design:type', String),
  ],
  SupplierQuote.prototype,
  'purchaseRequestId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'party_ref_id', type: 'uuid' }),
    __metadata('design:type', String),
  ],
  SupplierQuote.prototype,
  'partyRefId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'quote_number', type: 'varchar', length: 60 }),
    __metadata('design:type', String),
  ],
  SupplierQuote.prototype,
  'quoteNumber',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ type: 'numeric', precision: 14, scale: 2 }),
    __metadata('design:type', String),
  ],
  SupplierQuote.prototype,
  'amount',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'varchar', length: 3 }), __metadata('design:type', String)],
  SupplierQuote.prototype,
  'currency',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'valid_until', type: 'date', nullable: true }),
    __metadata('design:type', Object),
  ],
  SupplierQuote.prototype,
  'validUntil',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'text', nullable: true }), __metadata('design:type', Object)],
  SupplierQuote.prototype,
  'notes',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  SupplierQuote.prototype,
  'createdAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  SupplierQuote.prototype,
  'updatedAt',
  void 0,
);
exports.SupplierQuote = SupplierQuote = __decorate(
  [
    (0, typeorm_1.Index)('idx_supplier_quotes_request', ['purchaseRequestId', 'validUntil']),
    (0, typeorm_1.Index)('idx_supplier_quotes_tenant_request_party', [
      'tenantId',
      'purchaseRequestId',
      'partyRefId',
    ]),
    (0, typeorm_1.Index)('idx_supplier_quotes_tenant_valid_until', ['tenantId', 'validUntil']),
    (0, typeorm_1.Entity)({ name: 'supplier_quotes' }),
  ],
  SupplierQuote,
);
//# sourceMappingURL=supplier-quote.entity.js.map
