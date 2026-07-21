import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AssetLifecycleEventType, SerializedAssetStatus } from '@iwana/shared';

@Index('idx_asset_lifecycle_events_asset', ['serializedAssetId', 'createdAt'])
@Entity({ name: 'asset_lifecycle_events' })
export class AssetLifecycleEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'serialized_asset_id', type: 'uuid' })
  serializedAssetId: string;

  @Column({
    name: 'event_type',
    type: 'enum',
    enum: AssetLifecycleEventType,
    enumName: 'asset_lifecycle_event_type',
  })
  eventType: AssetLifecycleEventType;

  @Column({
    name: 'from_status',
    type: 'enum',
    enum: SerializedAssetStatus,
    enumName: 'serialized_asset_status',
    nullable: true,
  })
  fromStatus: SerializedAssetStatus | null;

  @Column({
    name: 'to_status',
    type: 'enum',
    enum: SerializedAssetStatus,
    enumName: 'serialized_asset_status',
    nullable: true,
  })
  toStatus: SerializedAssetStatus | null;

  @Column({ name: 'location_id', type: 'uuid', nullable: true })
  locationId: string | null;

  @Column({ name: 'responsible_ref_id', type: 'uuid', nullable: true })
  responsibleRefId: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId: string | null;

  @Column({ name: 'stock_movement_id', type: 'uuid', nullable: true })
  stockMovementId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
