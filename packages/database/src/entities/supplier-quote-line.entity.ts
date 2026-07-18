import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Index('idx_supplier_quote_lines_tenant_quote', ['tenantId', 'supplierQuoteId'])
@Index('idx_supplier_quote_lines_tenant_pr_line', ['tenantId', 'purchaseRequestLineId'])
@Index('uq_supplier_quote_lines_quote_pr_line', ['supplierQuoteId', 'purchaseRequestLineId'], {
  unique: true,
})
@Entity({ name: 'supplier_quote_lines' })
export class SupplierQuoteLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'supplier_quote_id', type: 'uuid' })
  supplierQuoteId: string;

  @Column({ name: 'purchase_request_line_id', type: 'uuid' })
  purchaseRequestLineId: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  quantity: string;

  @Column({ name: 'unit_cost', type: 'numeric', precision: 14, scale: 2 })
  unitCost: string;

  @Column({ name: 'line_amount', type: 'numeric', precision: 14, scale: 2 })
  lineAmount: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
