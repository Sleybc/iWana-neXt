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
exports.AssetLifecycleEvent = void 0;
const typeorm_1 = require('typeorm');
const shared_1 = require('@iwana/shared');
let AssetLifecycleEvent = class AssetLifecycleEvent {
  id;
  tenantId;
  serializedAssetId;
  eventType;
  fromStatus;
  toStatus;
  locationId;
  responsibleRefId;
  notes;
  actorUserId;
  createdAt;
  updatedAt;
};
exports.AssetLifecycleEvent = AssetLifecycleEvent;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  AssetLifecycleEvent.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  AssetLifecycleEvent.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'serialized_asset_id', type: 'uuid' }),
    __metadata('design:type', String),
  ],
  AssetLifecycleEvent.prototype,
  'serializedAssetId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'event_type',
      type: 'enum',
      enum: shared_1.AssetLifecycleEventType,
      enumName: 'asset_lifecycle_event_type',
    }),
    __metadata('design:type', String),
  ],
  AssetLifecycleEvent.prototype,
  'eventType',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'from_status',
      type: 'enum',
      enum: shared_1.SerializedAssetStatus,
      enumName: 'serialized_asset_status',
      nullable: true,
    }),
    __metadata('design:type', Object),
  ],
  AssetLifecycleEvent.prototype,
  'fromStatus',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'to_status',
      type: 'enum',
      enum: shared_1.SerializedAssetStatus,
      enumName: 'serialized_asset_status',
      nullable: true,
    }),
    __metadata('design:type', Object),
  ],
  AssetLifecycleEvent.prototype,
  'toStatus',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'location_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  AssetLifecycleEvent.prototype,
  'locationId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'responsible_ref_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  AssetLifecycleEvent.prototype,
  'responsibleRefId',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'text', nullable: true }), __metadata('design:type', Object)],
  AssetLifecycleEvent.prototype,
  'notes',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'actor_user_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  AssetLifecycleEvent.prototype,
  'actorUserId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  AssetLifecycleEvent.prototype,
  'createdAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  AssetLifecycleEvent.prototype,
  'updatedAt',
  void 0,
);
exports.AssetLifecycleEvent = AssetLifecycleEvent = __decorate(
  [
    (0, typeorm_1.Index)('idx_asset_lifecycle_events_asset', ['serializedAssetId', 'createdAt']),
    (0, typeorm_1.Entity)({ name: 'asset_lifecycle_events' }),
  ],
  AssetLifecycleEvent,
);
//# sourceMappingURL=asset-lifecycle-event.entity.js.map
