import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'billing_document_lines' })
export class BillingDocumentLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'document_id', type: 'uuid' })
  documentId: string;

  @Column({ name: 'kind', type: 'varchar', length: 16 })
  kind: string;

  @Column({ name: 'description', type: 'varchar', length: 200 })
  description: string;

  @Column({ name: 'quantity', type: 'numeric', precision: 10, scale: 4 })
  quantity: string;

  @Column({ name: 'unit_price', type: 'numeric', precision: 14, scale: 2 })
  unitPrice: string;

  @Column({ name: 'base_amount', type: 'numeric', precision: 14, scale: 2 })
  baseAmount: string;

  @Column({ name: 'tax_amount', type: 'numeric', precision: 14, scale: 2 })
  taxAmount: string;

  @Column({ name: 'total', type: 'numeric', precision: 14, scale: 2 })
  total: string;

  @Column({ name: 'vat_treatment', type: 'varchar', length: 16 })
  vatTreatment: string;

  @Column({ name: 'vat_rate', type: 'numeric', precision: 7, scale: 4 })
  vatRate: string;

  @Column({ name: 'vat_legal_basis', type: 'varchar', length: 60, nullable: true })
  vatLegalBasis: string | null;

  @Column({ name: 'position', type: 'smallint' })
  position: number;
}
