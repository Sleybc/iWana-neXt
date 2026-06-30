import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Index('idx_stock_movement_lines_movement', ['movementId', 'createdAt'])
@Entity({ name: 'stock_movement_lines' })
export class StockMovementLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'movement_id', type: 'uuid' })
  movementId: string;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @Column({ name: 'location_id', type: 'uuid' })
  locationId: string;

  @Column({ name: 'lot_id', type: 'uuid', nullable: true })
  lotId: string | null;

  @Column({ name: 'serialized_asset_id', type: 'uuid', nullable: true })
  serializedAssetId: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  quantity: string;

  @Column({ name: 'unit_cost', type: 'numeric', precision: 14, scale: 2, nullable: true })
  unitCost: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
