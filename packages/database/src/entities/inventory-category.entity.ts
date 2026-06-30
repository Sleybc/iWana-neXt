import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { InventoryCategoryStatus } from '@iwana/shared';

@Index('uq_inventory_categories_tenant_code', ['tenantId', 'code'], { unique: true })
@Index('idx_inventory_categories_tenant_status_sort', ['tenantId', 'status', 'sortOrder'])
@Entity({ name: 'inventory_categories' })
export class InventoryCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', length: 80 })
  code: string;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    type: 'enum',
    enum: InventoryCategoryStatus,
    enumName: 'inventory_category_status',
    default: InventoryCategoryStatus.ACTIVE,
  })
  status: InventoryCategoryStatus;

  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
