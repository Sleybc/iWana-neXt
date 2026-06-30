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
exports.InventoryItem = void 0;
const typeorm_1 = require('typeorm');
const inventory_category_entity_1 = require('./inventory-category.entity');
const shared_1 = require('@iwana/shared');
let InventoryItem = class InventoryItem {
  id;
  tenantId;
  sku;
  name;
  description;
  brand;
  model;
  itemKind;
  category;
  categoryId;
  inventoryCategory;
  trackingMode;
  unitOfMeasure;
  baseCost;
  minimumStock;
  purchasable;
  inventoryControlled;
  assetControlled;
  preferredSupplierRefId;
  supplierSku;
  purchaseUnitOfMeasure;
  purchaseToBaseUomFactor;
  standardCost;
  lastPurchaseCost;
  reorderPoint;
  targetStock;
  minimumOrderQty;
  orderMultiple;
  leadTimeDays;
  usefulLifeMonths;
  commercialReferenceId;
  status;
  createdAt;
  updatedAt;
};
exports.InventoryItem = InventoryItem;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  InventoryItem.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  InventoryItem.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'varchar', length: 60 }), __metadata('design:type', String)],
  InventoryItem.prototype,
  'sku',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'varchar', length: 200 }), __metadata('design:type', String)],
  InventoryItem.prototype,
  'name',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'text', nullable: true }), __metadata('design:type', Object)],
  InventoryItem.prototype,
  'description',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ type: 'varchar', length: 120, nullable: true }),
    __metadata('design:type', Object),
  ],
  InventoryItem.prototype,
  'brand',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ type: 'varchar', length: 120, nullable: true }),
    __metadata('design:type', Object),
  ],
  InventoryItem.prototype,
  'model',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'item_kind',
      type: 'enum',
      enum: shared_1.InventoryItemKind,
      enumName: 'inventory_item_kind',
      default: shared_1.InventoryItemKind.STOCK,
    }),
    __metadata('design:type', String),
  ],
  InventoryItem.prototype,
  'itemKind',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      type: 'enum',
      enum: shared_1.InventoryItemCategory,
      enumName: 'inventory_item_category',
    }),
    __metadata('design:type', String),
  ],
  InventoryItem.prototype,
  'category',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'category_id', type: 'uuid' }), __metadata('design:type', String)],
  InventoryItem.prototype,
  'categoryId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.ManyToOne)(() => inventory_category_entity_1.InventoryCategory, {
      nullable: false,
    }),
    (0, typeorm_1.JoinColumn)({ name: 'category_id' }),
    __metadata('design:type', inventory_category_entity_1.InventoryCategory),
  ],
  InventoryItem.prototype,
  'inventoryCategory',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'tracking_mode',
      type: 'enum',
      enum: shared_1.InventoryTrackingMode,
      enumName: 'inventory_tracking_mode',
    }),
    __metadata('design:type', String),
  ],
  InventoryItem.prototype,
  'trackingMode',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'unit_of_measure', type: 'varchar', length: 32 }),
    __metadata('design:type', String),
  ],
  InventoryItem.prototype,
  'unitOfMeasure',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'base_cost',
      type: 'numeric',
      precision: 14,
      scale: 2,
      default: 0,
    }),
    __metadata('design:type', String),
  ],
  InventoryItem.prototype,
  'baseCost',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'minimum_stock',
      type: 'numeric',
      precision: 12,
      scale: 2,
      default: 0,
    }),
    __metadata('design:type', String),
  ],
  InventoryItem.prototype,
  'minimumStock',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ default: true }), __metadata('design:type', Boolean)],
  InventoryItem.prototype,
  'purchasable',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'inventory_controlled', default: true }),
    __metadata('design:type', Boolean),
  ],
  InventoryItem.prototype,
  'inventoryControlled',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'asset_controlled', default: false }),
    __metadata('design:type', Boolean),
  ],
  InventoryItem.prototype,
  'assetControlled',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'preferred_supplier_ref_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  InventoryItem.prototype,
  'preferredSupplierRefId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'supplier_sku', type: 'varchar', length: 80, nullable: true }),
    __metadata('design:type', Object),
  ],
  InventoryItem.prototype,
  'supplierSku',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'purchase_unit_of_measure',
      type: 'varchar',
      length: 32,
      nullable: true,
    }),
    __metadata('design:type', Object),
  ],
  InventoryItem.prototype,
  'purchaseUnitOfMeasure',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'purchase_to_base_uom_factor',
      type: 'numeric',
      precision: 12,
      scale: 4,
      nullable: true,
    }),
    __metadata('design:type', Object),
  ],
  InventoryItem.prototype,
  'purchaseToBaseUomFactor',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'standard_cost',
      type: 'numeric',
      precision: 14,
      scale: 2,
      default: 0,
    }),
    __metadata('design:type', String),
  ],
  InventoryItem.prototype,
  'standardCost',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'last_purchase_cost',
      type: 'numeric',
      precision: 14,
      scale: 2,
      nullable: true,
    }),
    __metadata('design:type', Object),
  ],
  InventoryItem.prototype,
  'lastPurchaseCost',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'reorder_point',
      type: 'numeric',
      precision: 12,
      scale: 2,
      default: 0,
    }),
    __metadata('design:type', String),
  ],
  InventoryItem.prototype,
  'reorderPoint',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'target_stock',
      type: 'numeric',
      precision: 12,
      scale: 2,
      default: 0,
    }),
    __metadata('design:type', String),
  ],
  InventoryItem.prototype,
  'targetStock',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'minimum_order_qty',
      type: 'numeric',
      precision: 12,
      scale: 2,
      nullable: true,
    }),
    __metadata('design:type', Object),
  ],
  InventoryItem.prototype,
  'minimumOrderQty',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'order_multiple',
      type: 'numeric',
      precision: 12,
      scale: 2,
      nullable: true,
    }),
    __metadata('design:type', Object),
  ],
  InventoryItem.prototype,
  'orderMultiple',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'lead_time_days', type: 'integer', nullable: true }),
    __metadata('design:type', Object),
  ],
  InventoryItem.prototype,
  'leadTimeDays',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'useful_life_months', type: 'integer', nullable: true }),
    __metadata('design:type', Object),
  ],
  InventoryItem.prototype,
  'usefulLifeMonths',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'commercial_reference_id',
      type: 'varchar',
      length: 160,
      nullable: true,
    }),
    __metadata('design:type', Object),
  ],
  InventoryItem.prototype,
  'commercialReferenceId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      type: 'enum',
      enum: shared_1.InventoryItemStatus,
      enumName: 'inventory_item_status',
      default: shared_1.InventoryItemStatus.ACTIVE,
    }),
    __metadata('design:type', String),
  ],
  InventoryItem.prototype,
  'status',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  InventoryItem.prototype,
  'createdAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  InventoryItem.prototype,
  'updatedAt',
  void 0,
);
exports.InventoryItem = InventoryItem = __decorate(
  [
    (0, typeorm_1.Index)('uq_inventory_items_tenant_sku', ['tenantId', 'sku'], { unique: true }),
    (0, typeorm_1.Index)('idx_inventory_items_tenant_category_status', [
      'tenantId',
      'category',
      'status',
    ]),
    (0, typeorm_1.Index)('idx_inventory_items_tenant_category_id_status', [
      'tenantId',
      'categoryId',
      'status',
    ]),
    (0, typeorm_1.Index)('idx_inventory_items_tenant_status_purchasable', [
      'tenantId',
      'status',
      'purchasable',
    ]),
    (0, typeorm_1.Index)('idx_inventory_items_tenant_item_kind_status', [
      'tenantId',
      'itemKind',
      'status',
    ]),
    (0, typeorm_1.Index)('idx_inventory_items_tenant_preferred_supplier', [
      'tenantId',
      'preferredSupplierRefId',
    ]),
    (0, typeorm_1.Entity)({ name: 'inventory_items' }),
  ],
  InventoryItem,
);
//# sourceMappingURL=inventory-item.entity.js.map
