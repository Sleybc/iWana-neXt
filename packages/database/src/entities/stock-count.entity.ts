import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StockCountStatus } from '@iwana/shared';

@Index('idx_stock_counts_tenant_status_created_at', ['tenantId', 'status', 'createdAt'])
@Index('idx_stock_counts_tenant_location', ['tenantId', 'locationId'])
@Entity({ name: 'stock_counts' })
export class StockCount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'count_number', type: 'varchar', length: 40 })
  countNumber: string;

  @Column({
    type: 'enum',
    enum: StockCountStatus,
    enumName: 'stock_count_status',
    default: StockCountStatus.OPEN,
  })
  status: StockCountStatus;

  @Column({ name: 'location_id', type: 'uuid' })
  locationId: string;

  @Column({ name: 'category_id', type: 'uuid', nullable: true })
  categoryId: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId: string;

  @Column({ name: 'closed_by_user_id', type: 'uuid', nullable: true })
  closedByUserId: string | null;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @Column({ name: 'stock_movement_id', type: 'uuid', nullable: true })
  stockMovementId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
