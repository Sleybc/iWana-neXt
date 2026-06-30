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
exports.TaskAssignmentHistory = void 0;
const typeorm_1 = require('typeorm');
const shared_1 = require('@iwana/shared');
/**
 * Entidad TaskAssignmentHistory — schema por tenant (dinamico via search_path).
 * Historial de handoff entre responsables activos.
 */
let TaskAssignmentHistory = class TaskAssignmentHistory {
  id;
  tenantId;
  taskId;
  previousResponsibleType;
  previousResponsibleRefId;
  newResponsibleType;
  newResponsibleRefId;
  reason;
  actorUserId;
  createdAt;
};
exports.TaskAssignmentHistory = TaskAssignmentHistory;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  TaskAssignmentHistory.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  TaskAssignmentHistory.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'task_id', type: 'uuid' }), __metadata('design:type', String)],
  TaskAssignmentHistory.prototype,
  'taskId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'previous_responsible_type',
      type: 'enum',
      enum: shared_1.TaskResponsibleType,
    }),
    __metadata('design:type', String),
  ],
  TaskAssignmentHistory.prototype,
  'previousResponsibleType',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'previous_responsible_ref_id', type: 'varchar', length: 160 }),
    __metadata('design:type', String),
  ],
  TaskAssignmentHistory.prototype,
  'previousResponsibleRefId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'new_responsible_type',
      type: 'enum',
      enum: shared_1.TaskResponsibleType,
    }),
    __metadata('design:type', String),
  ],
  TaskAssignmentHistory.prototype,
  'newResponsibleType',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'new_responsible_ref_id', type: 'varchar', length: 160 }),
    __metadata('design:type', String),
  ],
  TaskAssignmentHistory.prototype,
  'newResponsibleRefId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ type: 'varchar', length: 500, nullable: true }),
    __metadata('design:type', Object),
  ],
  TaskAssignmentHistory.prototype,
  'reason',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'actor_user_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  TaskAssignmentHistory.prototype,
  'actorUserId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  TaskAssignmentHistory.prototype,
  'createdAt',
  void 0,
);
exports.TaskAssignmentHistory = TaskAssignmentHistory = __decorate(
  [
    (0, typeorm_1.Index)('idx_task_assignment_history_task', ['taskId', 'createdAt']),
    (0, typeorm_1.Entity)({ name: 'task_assignment_history' }),
  ],
  TaskAssignmentHistory,
);
//# sourceMappingURL=task-assignment-history.entity.js.map
