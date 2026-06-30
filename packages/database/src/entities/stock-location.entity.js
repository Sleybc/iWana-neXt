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
exports.StockLocation = void 0;
const typeorm_1 = require('typeorm');
const shared_1 = require('@iwana/shared');
let StockLocation = class StockLocation {
  id;
  tenantId;
  code;
  name;
  type;
  status;
  responsibleRefId;
  maxCapacity;
  createdAt;
  updatedAt;
};
exports.StockLocation = StockLocation;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  StockLocation.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  StockLocation.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'varchar', length: 60 }), __metadata('design:type', String)],
  StockLocation.prototype,
  'code',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'varchar', length: 200 }), __metadata('design:type', String)],
  StockLocation.prototype,
  'name',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      type: 'enum',
      enum: shared_1.StockLocationType,
      enumName: 'stock_location_type',
    }),
    __metadata('design:type', String),
  ],
  StockLocation.prototype,
  'type',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      type: 'enum',
      enum: shared_1.StockLocationStatus,
      enumName: 'stock_location_status',
      default: shared_1.StockLocationStatus.ACTIVE,
    }),
    __metadata('design:type', String),
  ],
  StockLocation.prototype,
  'status',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'responsible_ref_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  StockLocation.prototype,
  'responsibleRefId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'max_capacity',
      type: 'numeric',
      precision: 12,
      scale: 2,
      nullable: true,
    }),
    __metadata('design:type', Object),
  ],
  StockLocation.prototype,
  'maxCapacity',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  StockLocation.prototype,
  'createdAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  StockLocation.prototype,
  'updatedAt',
  void 0,
);
exports.StockLocation = StockLocation = __decorate(
  [
    (0, typeorm_1.Index)('idx_stock_locations_tenant_type_status', ['tenantId', 'type', 'status']),
    (0, typeorm_1.Index)(
      'uq_stock_locations_active_mobile_responsible',
      ['tenantId', 'responsibleRefId'],
      {
        unique: true,
        where: `"responsible_ref_id" IS NOT NULL AND "type" IN ('MOBILE_TECHNICIAN', 'MOBILE_CREW') AND "status" = 'ACTIVE'`,
      },
    ),
    (0, typeorm_1.Entity)({ name: 'stock_locations' }),
  ],
  StockLocation,
);
//# sourceMappingURL=stock-location.entity.js.map
