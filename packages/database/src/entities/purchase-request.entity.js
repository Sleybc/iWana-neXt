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
exports.PurchaseRequest = void 0;
const typeorm_1 = require('typeorm');
const shared_1 = require('@iwana/shared');
let PurchaseRequest = class PurchaseRequest {
  id;
  tenantId;
  requestNumber;
  title;
  status;
  requestType;
  priority;
  requestedByUserId;
  requestingArea;
  justification;
  operationalRefType;
  operationalRefId;
  exceptionReason;
  approvedByUserId;
  neededByDate;
  notes;
  createdAt;
  updatedAt;
};
exports.PurchaseRequest = PurchaseRequest;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  PurchaseRequest.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  PurchaseRequest.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'request_number', type: 'varchar', length: 40 }),
    __metadata('design:type', String),
  ],
  PurchaseRequest.prototype,
  'requestNumber',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'varchar', length: 200 }), __metadata('design:type', String)],
  PurchaseRequest.prototype,
  'title',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      type: 'enum',
      enum: shared_1.PurchaseRequestStatus,
      enumName: 'purchase_request_status',
      default: shared_1.PurchaseRequestStatus.DRAFT,
    }),
    __metadata('design:type', String),
  ],
  PurchaseRequest.prototype,
  'status',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'request_type',
      type: 'enum',
      enum: shared_1.PurchaseRequestType,
      enumName: 'purchase_request_type',
      default: shared_1.PurchaseRequestType.REPLENISHMENT,
    }),
    __metadata('design:type', String),
  ],
  PurchaseRequest.prototype,
  'requestType',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      type: 'enum',
      enum: shared_1.PurchaseRequestPriority,
      enumName: 'purchase_request_priority',
      default: shared_1.PurchaseRequestPriority.NORMAL,
    }),
    __metadata('design:type', String),
  ],
  PurchaseRequest.prototype,
  'priority',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'requested_by_user_id', type: 'uuid' }),
    __metadata('design:type', String),
  ],
  PurchaseRequest.prototype,
  'requestedByUserId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'requesting_area',
      type: 'varchar',
      length: 120,
      nullable: true,
    }),
    __metadata('design:type', Object),
  ],
  PurchaseRequest.prototype,
  'requestingArea',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'text', nullable: true }), __metadata('design:type', Object)],
  PurchaseRequest.prototype,
  'justification',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'operational_ref_type',
      type: 'varchar',
      length: 60,
      nullable: true,
    }),
    __metadata('design:type', Object),
  ],
  PurchaseRequest.prototype,
  'operationalRefType',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'operational_ref_id',
      type: 'varchar',
      length: 160,
      nullable: true,
    }),
    __metadata('design:type', Object),
  ],
  PurchaseRequest.prototype,
  'operationalRefId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'exception_reason', type: 'text', nullable: true }),
    __metadata('design:type', Object),
  ],
  PurchaseRequest.prototype,
  'exceptionReason',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'approved_by_user_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  PurchaseRequest.prototype,
  'approvedByUserId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'needed_by_date', type: 'date', nullable: true }),
    __metadata('design:type', Object),
  ],
  PurchaseRequest.prototype,
  'neededByDate',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'text', nullable: true }), __metadata('design:type', Object)],
  PurchaseRequest.prototype,
  'notes',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  PurchaseRequest.prototype,
  'createdAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  PurchaseRequest.prototype,
  'updatedAt',
  void 0,
);
exports.PurchaseRequest = PurchaseRequest = __decorate(
  [
    (0, typeorm_1.Index)('idx_purchase_requests_tenant_status', ['tenantId', 'status']),
    (0, typeorm_1.Index)('idx_purchase_requests_tenant_needed_by', ['tenantId', 'neededByDate']),
    (0, typeorm_1.Index)('idx_purchase_requests_tenant_type_priority', [
      'tenantId',
      'requestType',
      'priority',
    ]),
    (0, typeorm_1.Entity)({ name: 'purchase_requests' }),
  ],
  PurchaseRequest,
);
//# sourceMappingURL=purchase-request.entity.js.map
