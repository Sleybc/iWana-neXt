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
exports.ExecutionOrderEvidence = void 0;
const typeorm_1 = require('typeorm');
let ExecutionOrderEvidence = class ExecutionOrderEvidence {
  id;
  executionOrderId;
  tenantId;
  evidenceType;
  fileName;
  notes;
  actorUserId;
  createdAt;
};
exports.ExecutionOrderEvidence = ExecutionOrderEvidence;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  ExecutionOrderEvidence.prototype,
  'id',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'execution_order_id', type: 'uuid' }),
    __metadata('design:type', String),
  ],
  ExecutionOrderEvidence.prototype,
  'executionOrderId',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  ExecutionOrderEvidence.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'evidence_type', type: 'varchar', length: 64 }),
    __metadata('design:type', String),
  ],
  ExecutionOrderEvidence.prototype,
  'evidenceType',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'file_name', type: 'varchar', length: 200, nullable: true }),
    __metadata('design:type', Object),
  ],
  ExecutionOrderEvidence.prototype,
  'fileName',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'text', nullable: true }), __metadata('design:type', Object)],
  ExecutionOrderEvidence.prototype,
  'notes',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'actor_user_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  ExecutionOrderEvidence.prototype,
  'actorUserId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  ExecutionOrderEvidence.prototype,
  'createdAt',
  void 0,
);
exports.ExecutionOrderEvidence = ExecutionOrderEvidence = __decorate(
  [
    (0, typeorm_1.Index)('idx_execution_order_evidence_order', ['executionOrderId', 'createdAt']),
    (0, typeorm_1.Entity)({ name: 'execution_order_evidence' }),
  ],
  ExecutionOrderEvidence,
);
//# sourceMappingURL=execution-order-evidence.entity.js.map
