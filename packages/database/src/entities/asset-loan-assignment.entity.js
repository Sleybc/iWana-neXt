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
exports.AssetLoanAssignment = void 0;
const typeorm_1 = require('typeorm');
let AssetLoanAssignment = class AssetLoanAssignment {
  id;
  tenantId;
  serializedAssetId;
  subscriberRefId;
  contractRefId;
  installedAt;
  removedAt;
  executionOrderRefId;
  stockMovementId;
  createdAt;
  updatedAt;
};
exports.AssetLoanAssignment = AssetLoanAssignment;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  AssetLoanAssignment.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  AssetLoanAssignment.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'serialized_asset_id', type: 'uuid' }),
    __metadata('design:type', String),
  ],
  AssetLoanAssignment.prototype,
  'serializedAssetId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'subscriber_ref_id', type: 'uuid' }),
    __metadata('design:type', String),
  ],
  AssetLoanAssignment.prototype,
  'subscriberRefId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'contract_ref_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  AssetLoanAssignment.prototype,
  'contractRefId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'installed_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  AssetLoanAssignment.prototype,
  'installedAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'removed_at', type: 'timestamptz', nullable: true }),
    __metadata('design:type', Object),
  ],
  AssetLoanAssignment.prototype,
  'removedAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'execution_order_ref_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  AssetLoanAssignment.prototype,
  'executionOrderRefId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'stock_movement_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  AssetLoanAssignment.prototype,
  'stockMovementId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  AssetLoanAssignment.prototype,
  'createdAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  AssetLoanAssignment.prototype,
  'updatedAt',
  void 0,
);
exports.AssetLoanAssignment = AssetLoanAssignment = __decorate(
  [
    (0, typeorm_1.Index)('idx_asset_loan_assignments_asset', ['serializedAssetId', 'installedAt']),
    (0, typeorm_1.Entity)({ name: 'asset_loan_assignments' }),
  ],
  AssetLoanAssignment,
);
//# sourceMappingURL=asset-loan-assignment.entity.js.map
