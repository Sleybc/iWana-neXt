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
exports.InventoryCategory = void 0;
const typeorm_1 = require('typeorm');
const shared_1 = require('@iwana/shared');
let InventoryCategory = class InventoryCategory {
  id;
  tenantId;
  code;
  name;
  description;
  status;
  sortOrder;
  createdAt;
  updatedAt;
};
exports.InventoryCategory = InventoryCategory;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  InventoryCategory.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  InventoryCategory.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'varchar', length: 80 }), __metadata('design:type', String)],
  InventoryCategory.prototype,
  'code',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'varchar', length: 160 }), __metadata('design:type', String)],
  InventoryCategory.prototype,
  'name',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'text', nullable: true }), __metadata('design:type', Object)],
  InventoryCategory.prototype,
  'description',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      type: 'enum',
      enum: shared_1.InventoryCategoryStatus,
      enumName: 'inventory_category_status',
      default: shared_1.InventoryCategoryStatus.ACTIVE,
    }),
    __metadata('design:type', String),
  ],
  InventoryCategory.prototype,
  'status',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'sort_order', type: 'integer', default: 0 }),
    __metadata('design:type', Number),
  ],
  InventoryCategory.prototype,
  'sortOrder',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  InventoryCategory.prototype,
  'createdAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  InventoryCategory.prototype,
  'updatedAt',
  void 0,
);
exports.InventoryCategory = InventoryCategory = __decorate(
  [
    (0, typeorm_1.Index)('uq_inventory_categories_tenant_code', ['tenantId', 'code'], {
      unique: true,
    }),
    (0, typeorm_1.Index)('idx_inventory_categories_tenant_status_sort', [
      'tenantId',
      'status',
      'sortOrder',
    ]),
    (0, typeorm_1.Entity)({ name: 'inventory_categories' }),
  ],
  InventoryCategory,
);
//# sourceMappingURL=inventory-category.entity.js.map
