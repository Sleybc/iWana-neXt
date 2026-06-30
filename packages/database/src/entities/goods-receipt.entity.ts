import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { GoodsReceiptStatus } from '@iwana/shared';

@Index('idx_goods_receipts_tenant_po_date', ['tenantId', 'purchaseOrderId', 'receivedAt'])
@Entity({ name: 'goods_receipts' })
export class GoodsReceipt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'receipt_number', type: 'varchar', length: 40 })
  receiptNumber: string;

  @Column({ name: 'purchase_order_id', type: 'uuid' })
  purchaseOrderId: string;

  @Column({
    type: 'enum',
    enum: GoodsReceiptStatus,
    enumName: 'goods_receipt_status',
    default: GoodsReceiptStatus.DRAFT,
  })
  status: GoodsReceiptStatus;

  @Column({ name: 'received_at', type: 'timestamptz' })
  receivedAt: Date;

  @Column({ name: 'received_by_user_id', type: 'uuid', nullable: true })
  receivedByUserId: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
