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

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
