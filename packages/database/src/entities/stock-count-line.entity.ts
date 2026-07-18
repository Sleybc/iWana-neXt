import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { StockBalanceCondition } from '@iwana/shared';

@Index('idx_stock_count_lines_count', ['countId', 'createdAt'])
@Entity({ name: 'stock_count_lines' })
export class StockCountLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'count_id', type: 'uuid' })
  countId: string;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @Column({ name: 'lot_id', type: 'uuid', nullable: true })
  lotId: string | null;

  @Column({
    type: 'enum',
    enum: StockBalanceCondition,
    enumName: 'stock_balance_condition',
    default: StockBalanceCondition.NEW,
  })
  condition: StockBalanceCondition;

  @Column({ name: 'expected_qty', type: 'numeric', precision: 12, scale: 2 })
  expectedQty: string;

  @Column({ name: 'counted_qty', type: 'numeric', precision: 12, scale: 2, nullable: true })
  countedQty: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
