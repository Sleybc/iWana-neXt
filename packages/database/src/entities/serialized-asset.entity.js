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
exports.SerializedAsset = void 0;
const typeorm_1 = require('typeorm');
const shared_1 = require('@iwana/shared');
let SerializedAsset = class SerializedAsset {
  id;
  tenantId;
  inventoryItemId;
  serialNumber;
  normalizedSerialNumber;
  macAddress;
  normalizedMacAddress;
  assetTag;
  currentStatus;
  currentLocationId;
  currentResponsibleType;
  currentResponsibleRefId;
  subscriberRefId;
  contractRefId;
  purchaseOrderRef;
  purchaseDate;
  usefulLifeMonths;
  warrantyUntil;
  createdAt;
  updatedAt;
};
exports.SerializedAsset = SerializedAsset;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  SerializedAsset.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  SerializedAsset.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'inventory_item_id', type: 'uuid' }),
    __metadata('design:type', String),
  ],
  SerializedAsset.prototype,
  'inventoryItemId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'serial_number', type: 'varchar', length: 160, nullable: true }),
    __metadata('design:type', Object),
  ],
  SerializedAsset.prototype,
  'serialNumber',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'normalized_serial_number',
      type: 'varchar',
      length: 160,
      nullable: true,
    }),
    __metadata('design:type', Object),
  ],
  SerializedAsset.prototype,
  'normalizedSerialNumber',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'mac_address', type: 'varchar', length: 64, nullable: true }),
    __metadata('design:type', Object),
  ],
  SerializedAsset.prototype,
  'macAddress',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'normalized_mac_address',
      type: 'varchar',
      length: 64,
      nullable: true,
    }),
    __metadata('design:type', Object),
  ],
  SerializedAsset.prototype,
  'normalizedMacAddress',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'asset_tag', type: 'varchar', length: 120, nullable: true }),
    __metadata('design:type', Object),
  ],
  SerializedAsset.prototype,
  'assetTag',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'current_status',
      type: 'enum',
      enum: shared_1.SerializedAssetStatus,
      enumName: 'serialized_asset_status',
      default: shared_1.SerializedAssetStatus.ORDERED,
    }),
    __metadata('design:type', String),
  ],
  SerializedAsset.prototype,
  'currentStatus',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'current_location_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  SerializedAsset.prototype,
  'currentLocationId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'current_responsible_type',
      type: 'enum',
      enum: shared_1.InventoryResponsibleType,
      enumName: 'inventory_responsible_type',
      default: shared_1.InventoryResponsibleType.NONE,
    }),
    __metadata('design:type', String),
  ],
  SerializedAsset.prototype,
  'currentResponsibleType',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'current_responsible_ref_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  SerializedAsset.prototype,
  'currentResponsibleRefId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'subscriber_ref_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  SerializedAsset.prototype,
  'subscriberRefId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'contract_ref_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  SerializedAsset.prototype,
  'contractRefId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'purchase_order_ref',
      type: 'varchar',
      length: 80,
      nullable: true,
    }),
    __metadata('design:type', Object),
  ],
  SerializedAsset.prototype,
  'purchaseOrderRef',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'purchase_date', type: 'date', nullable: true }),
    __metadata('design:type', Object),
  ],
  SerializedAsset.prototype,
  'purchaseDate',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'useful_life_months', type: 'integer', nullable: true }),
    __metadata('design:type', Object),
  ],
  SerializedAsset.prototype,
  'usefulLifeMonths',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'warranty_until', type: 'date', nullable: true }),
    __metadata('design:type', Object),
  ],
  SerializedAsset.prototype,
  'warrantyUntil',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  SerializedAsset.prototype,
  'createdAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  SerializedAsset.prototype,
  'updatedAt',
  void 0,
);
exports.SerializedAsset = SerializedAsset = __decorate(
  [
    (0, typeorm_1.Index)(
      'uq_serialized_assets_tenant_normalized_serial',
      ['tenantId', 'normalizedSerialNumber'],
      {
        unique: true,
        where: `"normalized_serial_number" IS NOT NULL`,
      },
    ),
    (0, typeorm_1.Index)(
      'uq_serialized_assets_tenant_normalized_mac',
      ['tenantId', 'normalizedMacAddress'],
      {
        unique: true,
        where: `"normalized_mac_address" IS NOT NULL`,
      },
    ),
    (0, typeorm_1.Index)('idx_serialized_assets_tenant_status', ['tenantId', 'currentStatus']),
    (0, typeorm_1.Index)('idx_serialized_assets_tenant_location', [
      'tenantId',
      'currentLocationId',
    ]),
    (0, typeorm_1.Index)('idx_serialized_assets_tenant_responsible', [
      'tenantId',
      'currentResponsibleType',
      'currentResponsibleRefId',
    ]),
    (0, typeorm_1.Entity)({ name: 'serialized_assets' }),
  ],
  SerializedAsset,
);
//# sourceMappingURL=serialized-asset.entity.js.map
