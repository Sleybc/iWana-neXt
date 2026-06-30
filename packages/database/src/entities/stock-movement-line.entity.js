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
exports.StockMovementLine = void 0;
const typeorm_1 = require('typeorm');
let StockMovementLine = class StockMovementLine {
  id;
  tenantId;
  movementId;
  itemId;
  locationId;
  lotId;
  serializedAssetId;
  quantity;
  unitCost;
  createdAt;
  updatedAt;
};
exports.StockMovementLine = StockMovementLine;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  StockMovementLine.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  StockMovementLine.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'movement_id', type: 'uuid' }), __metadata('design:type', String)],
  StockMovementLine.prototype,
  'movementId',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'item_id', type: 'uuid' }), __metadata('design:type', String)],
  StockMovementLine.prototype,
  'itemId',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'location_id', type: 'uuid' }), __metadata('design:type', String)],
  StockMovementLine.prototype,
  'locationId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'lot_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  StockMovementLine.prototype,
  'lotId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'serialized_asset_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  StockMovementLine.prototype,
  'serializedAssetId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ type: 'numeric', precision: 12, scale: 2 }),
    __metadata('design:type', String),
  ],
  StockMovementLine.prototype,
  'quantity',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'unit_cost',
      type: 'numeric',
      precision: 14,
      scale: 2,
      nullable: true,
    }),
    __metadata('design:type', Object),
  ],
  StockMovementLine.prototype,
  'unitCost',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  StockMovementLine.prototype,
  'createdAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  StockMovementLine.prototype,
  'updatedAt',
  void 0,
);
exports.StockMovementLine = StockMovementLine = __decorate(
  [
    (0, typeorm_1.Index)('idx_stock_movement_lines_movement', ['movementId', 'createdAt']),
    (0, typeorm_1.Entity)({ name: 'stock_movement_lines' }),
  ],
  StockMovementLine,
);
//# sourceMappingURL=stock-movement-line.entity.js.map
