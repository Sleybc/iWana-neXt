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
exports.ScheduleRescheduleLog = void 0;
const typeorm_1 = require('typeorm');
/**
 * Entidad ScheduleRescheduleLog — schema por tenant (dinamico via search_path).
 *
 * Historial append-only de reagendamientos. No tiene updatedAt ni deletedAt
 * por diseno: cada registro es inmutable desde su creacion.
 *
 * Sin @Entity({ schema }) — resuelto via SET LOCAL search_path (ADR-037, ADR-018).
 *
 * HLD-MOD09-PROGRAMACION-WFM-v1.0 §4, SPEC-MOD09 §6.4
 */
let ScheduleRescheduleLog = class ScheduleRescheduleLog {
  id;
  /** FK logica a public.tenants.id — sin FK referencial cross-schema */
  tenantId;
  /** Referencia al evento de agenda reagendado */
  scheduleEventId;
  fromStartAt;
  fromEndAt;
  toStartAt;
  toEndAt;
  /** Motivo obligatorio del reagendamiento */
  reason;
  notes;
  changedBy;
  createdAt;
};
exports.ScheduleRescheduleLog = ScheduleRescheduleLog;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  ScheduleRescheduleLog.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  ScheduleRescheduleLog.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'schedule_event_id', type: 'uuid' }),
    __metadata('design:type', String),
  ],
  ScheduleRescheduleLog.prototype,
  'scheduleEventId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'from_start_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  ScheduleRescheduleLog.prototype,
  'fromStartAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'from_end_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  ScheduleRescheduleLog.prototype,
  'fromEndAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'to_start_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  ScheduleRescheduleLog.prototype,
  'toStartAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'to_end_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  ScheduleRescheduleLog.prototype,
  'toEndAt',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'varchar', length: 120 }), __metadata('design:type', String)],
  ScheduleRescheduleLog.prototype,
  'reason',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'text', nullable: true }), __metadata('design:type', Object)],
  ScheduleRescheduleLog.prototype,
  'notes',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'changed_by', type: 'uuid' }), __metadata('design:type', String)],
  ScheduleRescheduleLog.prototype,
  'changedBy',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  ScheduleRescheduleLog.prototype,
  'createdAt',
  void 0,
);
exports.ScheduleRescheduleLog = ScheduleRescheduleLog = __decorate(
  [
    (0, typeorm_1.Index)('idx_reschedule_logs_tenant_event', ['tenantId', 'scheduleEventId']),
    (0, typeorm_1.Entity)({ name: 'schedule_reschedule_logs' }), // Sin schema — resuelto via SET LOCAL search_path
  ],
  ScheduleRescheduleLog,
);
//# sourceMappingURL=schedule-reschedule-log.entity.js.map
