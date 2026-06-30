import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Index('idx_purchase_order_lines_order', ['purchaseOrderId', 'createdAt'])
@Index('idx_purchase_order_lines_tenant_request_line', ['tenantId', 'purchaseRequestLineId'])
@Entity({ name: 'purchase_order_lines' })
export class PurchaseOrderLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'purchase_order_id', type: 'uuid' })
  purchaseOrderId: string;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @Column({ name: 'purchase_request_line_id', type: 'uuid', nullable: true })
  purchaseRequestLineId: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  quantity: string;

  @Column({ name: 'unit_cost', type: 'numeric', precision: 14, scale: 2 })
  unitCost: string;

  @Column({ name: 'received_quantity', type: 'numeric', precision: 12, scale: 2, default: 0 })
  receivedQuantity: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
