import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StockBalanceCondition } from '@iwana/shared';

@Index(
  'uq_stock_balances_tenant_item_location_lot_condition',
  ['tenantId', 'itemId', 'locationId', 'lotId', 'condition'],
  {
    unique: true,
    where: `"lot_id" IS NOT NULL`,
  },
)
@Index(
  'uq_stock_balances_tenant_item_location_condition_no_lot',
  ['tenantId', 'itemId', 'locationId', 'condition'],
  {
    unique: true,
    where: `"lot_id" IS NULL`,
  },
)
@Index('idx_stock_balances_tenant_location_item', ['tenantId', 'locationId', 'itemId'])
@Entity({ name: 'stock_balances' })
export class StockBalance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @Column({ name: 'location_id', type: 'uuid' })
  locationId: string;

  @Column({ name: 'lot_id', type: 'uuid', nullable: true })
  lotId: string | null;

  @Column({
    type: 'enum',
    enum: StockBalanceCondition,
    enumName: 'stock_balance_condition',
    default: StockBalanceCondition.NEW,
  })
  condition: StockBalanceCondition;

  @Column({ name: 'quantity_on_hand', type: 'numeric', precision: 12, scale: 2, default: 0 })
  quantityOnHand: string;

  @Column({ name: 'quantity_reserved', type: 'numeric', precision: 12, scale: 2, default: 0 })
  quantityReserved: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
