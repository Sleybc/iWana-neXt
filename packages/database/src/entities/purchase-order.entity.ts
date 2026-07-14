import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PurchaseOrderStatus } from '@iwana/shared';

@Index('uq_purchase_orders_tenant_order_number', ['tenantId', 'orderNumber'], {
  unique: true,
})
@Index('idx_purchase_orders_tenant_supplier', ['tenantId', 'partyRefId'])
@Index('idx_purchase_orders_tenant_status', ['tenantId', 'status'])
@Index('idx_purchase_orders_tenant_expected_delivery', ['tenantId', 'expectedDeliveryDate'])
@Entity({ name: 'purchase_orders' })
export class PurchaseOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'order_number', type: 'varchar', length: 40 })
  orderNumber: string;

  @Column({ name: 'purchase_request_id', type: 'uuid', nullable: true })
  purchaseRequestId: string | null;

  @Column({ name: 'party_ref_id', type: 'uuid' })
  partyRefId: string;

  @Column({
    type: 'enum',
    enum: PurchaseOrderStatus,
    enumName: 'purchase_order_status',
    default: PurchaseOrderStatus.DRAFT,
  })
  status: PurchaseOrderStatus;

  @Column({ name: 'expected_delivery_date', type: 'date', nullable: true })
  expectedDeliveryDate: string | null;

  @Column({ name: 'approved_by_user_id', type: 'uuid', nullable: true })
  approvedByUserId: string | null;

  @Column({ name: 'cancellation_reason', type: 'text', nullable: true })
  cancellationReason: string | null;

  @Column({ name: 'cancelled_by_user_id', type: 'uuid', nullable: true })
  cancelledByUserId: string | null;

  @Column({ name: 'closed_by_user_id', type: 'uuid', nullable: true })
  closedByUserId: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
