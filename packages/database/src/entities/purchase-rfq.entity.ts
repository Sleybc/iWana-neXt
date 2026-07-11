import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PurchaseRfqStatus } from '@iwana/shared';

@Index('idx_purchase_rfqs_tenant_request', ['tenantId', 'purchaseRequestId'])
@Index('idx_purchase_rfqs_tenant_status', ['tenantId', 'status'])
@Entity({ name: 'purchase_rfqs' })
export class PurchaseRfq {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'purchase_request_id', type: 'uuid' })
  purchaseRequestId: string;

  @Column({ name: 'rfq_number', type: 'varchar', length: 40 })
  rfqNumber: string;

  @Column({
    type: 'enum',
    enum: PurchaseRfqStatus,
    enumName: 'purchase_rfq_status',
    default: PurchaseRfqStatus.DRAFT,
  })
  status: PurchaseRfqStatus;

  @Column({ type: 'varchar', length: 3, default: 'COP' })
  currency: string;

  @Column({ name: 'response_deadline', type: 'date', nullable: true })
  responseDeadline: string | null;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId: string | null;

  @Column({ name: 'sent_by_user_id', type: 'uuid', nullable: true })
  sentByUserId: string | null;

  @Column({ name: 'closed_by_user_id', type: 'uuid', nullable: true })
  closedByUserId: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
