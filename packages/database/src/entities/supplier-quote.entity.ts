import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Index('idx_supplier_quotes_request', ['purchaseRequestId', 'validUntil'])
@Index('idx_supplier_quotes_tenant_request_party', ['tenantId', 'purchaseRequestId', 'partyRefId'])
@Index('idx_supplier_quotes_tenant_valid_until', ['tenantId', 'validUntil'])
@Entity({ name: 'supplier_quotes' })
export class SupplierQuote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'purchase_request_id', type: 'uuid' })
  purchaseRequestId: string;

  @Column({ name: 'party_ref_id', type: 'uuid' })
  partyRefId: string;

  @Column({ name: 'rfq_id', type: 'uuid', nullable: true })
  rfqId: string | null;

  @Column({ name: 'rfq_invitation_id', type: 'uuid', nullable: true })
  rfqInvitationId: string | null;

  @Column({ name: 'quote_number', type: 'varchar', length: 60 })
  quoteNumber: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount: string;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @Column({ name: 'valid_until', type: 'date', nullable: true })
  validUntil: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
