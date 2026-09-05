import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Index('idx_supplier_quote_taxes_tenant_quote', ['tenantId', 'supplierQuoteId'])
@Index('uq_supplier_quote_taxes_quote_tax_code', ['supplierQuoteId', 'taxCode'], {
  unique: true,
})
@Entity({ name: 'supplier_quote_taxes' })
export class SupplierQuoteTax {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'supplier_quote_id', type: 'uuid' })
  supplierQuoteId: string;

  @Column({ name: 'tax_code', type: 'varchar', length: 32 })
  taxCode: string;

  @Column({ name: 'tax_category', type: 'varchar', length: 20 })
  taxCategory: string;

  @Column({ type: 'varchar', length: 10 })
  effect: string;

  @Column({ type: 'numeric', precision: 7, scale: 4 })
  rate: string;

  @Column({ name: 'base_amount', type: 'numeric', precision: 14, scale: 2 })
  baseAmount: string;

  @Column({ name: 'tax_amount', type: 'numeric', precision: 14, scale: 2 })
  taxAmount: string;

  @Column({ name: 'tax_definition_id', type: 'uuid', nullable: true })
  taxDefinitionId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
