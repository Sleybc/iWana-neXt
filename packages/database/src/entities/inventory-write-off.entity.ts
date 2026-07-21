import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WriteOffReason, WriteOffStatus } from '@iwana/shared';

@Index('idx_inventory_write_offs_tenant_status', ['tenantId', 'status'])
@Index('idx_inventory_write_offs_tenant_approved_at', ['tenantId', 'approvedAt'])
@Entity({ name: 'inventory_write_offs' })
export class InventoryWriteOff {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'serialized_asset_id', type: 'uuid', nullable: true })
  serializedAssetId: string | null;

  @Column({ name: 'item_id', type: 'uuid', nullable: true })
  itemId: string | null;

  @Column({ name: 'location_id', type: 'uuid' })
  locationId: string;

  @Column({ type: 'numeric', precision: 18, scale: 4, default: 1 })
  quantity: string;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 160, nullable: true })
  idempotencyKey: string | null;

  @Column({
    type: 'enum',
    enum: WriteOffReason,
    enumName: 'write_off_reason',
  })
  reason: WriteOffReason;

  @Column({
    type: 'enum',
    enum: WriteOffStatus,
    enumName: 'write_off_status',
    default: WriteOffStatus.REQUESTED,
  })
  status: WriteOffStatus;

  @Column({ name: 'requested_by_user_id', type: 'uuid' })
  requestedByUserId: string;

  @Column({ name: 'approved_by_user_id', type: 'uuid', nullable: true })
  approvedByUserId: string | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'stock_movement_id', type: 'uuid', nullable: true })
  stockMovementId: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'rejected_by_user_id', type: 'uuid', nullable: true })
  rejectedByUserId: string | null;

  @Column({ name: 'rejected_at', type: 'timestamptz', nullable: true })
  rejectedAt: Date | null;

  @Column({ name: 'rejection_notes', type: 'text', nullable: true })
  rejectionNotes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
