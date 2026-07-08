import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StockBalanceCondition } from '@iwana/shared';

@Index('idx_stock_issue_lines_issue', ['issueId', 'createdAt'])
@Entity({ name: 'stock_issue_lines' })
export class StockIssueLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'issue_id', type: 'uuid' })
  issueId: string;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @Column({ name: 'requested_qty', type: 'numeric', precision: 12, scale: 2 })
  requestedQty: string;

  @Column({ name: 'dispatched_qty', type: 'numeric', precision: 12, scale: 2, nullable: true })
  dispatchedQty: string | null;

  @Column({ name: 'lot_id', type: 'uuid', nullable: true })
  lotId: string | null;

  @Column({ name: 'serialized_asset_id', type: 'uuid', nullable: true })
  serializedAssetId: string | null;

  @Column({
    type: 'enum',
    enum: StockBalanceCondition,
    enumName: 'stock_balance_condition',
    default: StockBalanceCondition.NEW,
  })
  condition: StockBalanceCondition;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
