import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'billing_documents' })
@Unique('uq_billing_documents_tenant_number', ['tenantId', 'number'])
@Index('idx_billing_documents_subscriber', ['subscriberId', 'status'])
export class BillingDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'period_id', type: 'uuid' })
  periodId: string;

  @Column({ name: 'contract_id', type: 'uuid' })
  contractId: string;

  @Column({ name: 'subscriber_id', type: 'uuid' })
  subscriberId: string;

  @Column({ name: 'status', type: 'varchar', length: 10 })
  status: string;

  @Column({ name: 'number', type: 'varchar', length: 30, nullable: true })
  number: string | null;

  @Column({ name: 'issue_date', type: 'date', nullable: true })
  issueDate: string | null;

  @Column({ name: 'due_date', type: 'date' })
  dueDate: string;

  @Column({ name: 'subtotal', type: 'numeric', precision: 14, scale: 2 })
  subtotal: string;

  @Column({ name: 'tax_total', type: 'numeric', precision: 14, scale: 2 })
  taxTotal: string;

  @Column({ name: 'total', type: 'numeric', precision: 14, scale: 2 })
  total: string;

  @Column({ name: 'blocking_reason', type: 'varchar', length: 60, nullable: true })
  blockingReason: string | null;

  @Column({ name: 'buyer_snapshot', type: 'jsonb', nullable: true })
  buyerSnapshot: Record<string, unknown> | null;

  @Column({ name: 'buyer_document_encrypted', type: 'varchar', length: 500, nullable: true })
  buyerDocumentEncrypted: string | null;

  @Column({ name: 'unbilled_additional_count', type: 'smallint', default: 0 })
  unbilledAdditionalCount: number;

  @Column({ name: 'issuer_snapshot', type: 'jsonb', nullable: true })
  issuerSnapshot: Record<string, unknown> | null;

  @Column({ name: 'void_reason_code', type: 'varchar', length: 40, nullable: true })
  voidReasonCode: string | null;

  @Column({ name: 'void_note', type: 'varchar', length: 500, nullable: true })
  voidNote: string | null;

  @Column({ name: 'voided_at', type: 'timestamptz', nullable: true })
  voidedAt: Date | null;

  @Column({ name: 'voided_by', type: 'uuid', nullable: true })
  voidedBy: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
