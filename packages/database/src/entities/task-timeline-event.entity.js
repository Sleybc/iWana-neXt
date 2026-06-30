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
exports.TaskTimelineEvent = void 0;
const typeorm_1 = require('typeorm');
const shared_1 = require('@iwana/shared');
/**
 * Entidad TaskTimelineEvent — schema por tenant (dinamico via search_path).
 * Registro append-only del ciclo de vida de una tarea operativa.
 */
let TaskTimelineEvent = class TaskTimelineEvent {
  id;
  taskId;
  tenantId;
  eventType;
  payload;
  actorUserId;
  occurredAt;
};
exports.TaskTimelineEvent = TaskTimelineEvent;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  TaskTimelineEvent.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'task_id', type: 'uuid' }), __metadata('design:type', String)],
  TaskTimelineEvent.prototype,
  'taskId',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  TaskTimelineEvent.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'event_type',
      type: 'enum',
      enum: shared_1.TaskTimelineEventType,
    }),
    __metadata('design:type', String),
  ],
  TaskTimelineEvent.prototype,
  'eventType',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'jsonb', default: {} }), __metadata('design:type', Object)],
  TaskTimelineEvent.prototype,
  'payload',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'actor_user_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  TaskTimelineEvent.prototype,
  'actorUserId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'occurred_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  TaskTimelineEvent.prototype,
  'occurredAt',
  void 0,
);
exports.TaskTimelineEvent = TaskTimelineEvent = __decorate(
  [
    (0, typeorm_1.Index)('idx_task_timeline_task', ['taskId', 'occurredAt']),
    (0, typeorm_1.Entity)({ name: 'task_timeline_events' }),
  ],
  TaskTimelineEvent,
);
//# sourceMappingURL=task-timeline-event.entity.js.map
