import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Index('idx_purchase_request_line_awards_tenant_line', ['tenantId', 'purchaseRequestLineId'])
@Index('idx_purchase_request_line_awards_tenant_party', ['tenantId', 'awardedPartyRefId'])
@Entity({ name: 'purchase_request_line_awards' })
export class PurchaseRequestLineAward {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'purchase_request_line_id', type: 'uuid' })
  purchaseRequestLineId: string;

  @Column({ name: 'supplier_quote_id', type: 'uuid', nullable: true })
  supplierQuoteId: string | null;

  @Column({ name: 'awarded_party_ref_id', type: 'uuid' })
  awardedPartyRefId: string;

  @Column({ name: 'awarded_quantity', type: 'numeric', precision: 12, scale: 2 })
  awardedQuantity: string;

  @Column({ name: 'award_notes', type: 'text', nullable: true })
  awardNotes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
