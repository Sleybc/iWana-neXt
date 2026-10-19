import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ContractStatus } from '../../enums/contract-status.enum';
import { CustomerSegment, ServiceUsage } from '@iwana/shared';
import type { ContractServicePointSnapshot } from '@iwana/shared';

@Entity({ name: 'contracts' })
@Index('idx_contracts_tenant_status', ['tenantId', 'status'])
@Index('idx_contracts_quote', ['quoteId'])
@Index('idx_contracts_tenant_subscriber', ['tenantId', 'subscriberId'])
@Index('uq_contracts_stratum_evidence', ['stratumEvidenceMediaId'], {
  unique: true,
  where: '"stratum_evidence_media_id" IS NOT NULL',
})
export class Contract {
  /** Marca del suscriptor asociada a las proyecciones HTTP; no es columna de contracts. */
  titularAnonymizedAt: string | null = null;

  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'uuid', name: 'quote_id', nullable: true })
  quoteId: string | null;

  @Column({ type: 'uuid', name: 'subscriber_id' })
  subscriberId: string;

  @Column({ type: 'varchar', length: 120, name: 'plan_id' })
  planId: string;

  @Column({ type: 'jsonb', name: 'plan_snapshot_json' })
  planSnapshotJson: Record<string, unknown>;

  @Column({ type: 'enum', enum: ContractStatus, name: 'status', default: ContractStatus.DRAFT })
  status: ContractStatus;

  @Column({ type: 'varchar', length: 40, name: 'status_reason_code', nullable: true })
  statusReasonCode: string | null;

  @Column({ type: 'timestamptz', name: 'status_changed_at', nullable: true })
  statusChangedAt: Date | null;

  /** Alias visible del servicio. Obligatorio; autogenerado si no se provee. */
  @Column({ type: 'varchar', length: 120, name: 'alias' })
  alias: string;

  // ── Dirección de instalación ──────────────────────────────────────────────

  @Column({ type: 'varchar', length: 255, name: 'installation_address', nullable: true })
  installationAddress: string | null;

  @Column({ type: 'varchar', length: 120, name: 'installation_city', nullable: true })
  installationCity: string | null;

  @Column({ type: 'varchar', length: 120, name: 'installation_department', nullable: true })
  installationDepartment: string | null;

  @Column({ type: 'varchar', length: 20, name: 'installation_postal_code', nullable: true })
  installationPostalCode: string | null;

  @Column({ type: 'text', name: 'installation_notes', nullable: true })
  installationNotes: string | null;

  // ── Segmento override (NULL → hereda el segmento del subscriber) ──────────

  @Column({
    type: 'varchar',
    length: 20,
    name: 'customer_segment',
    nullable: true,
    enum: CustomerSegment,
  })
  customerSegment: CustomerSegment | null;

  @Column({ type: 'varchar', length: 20, name: 'service_usage', nullable: true })
  serviceUsage: ServiceUsage | null;

  @Column({ type: 'smallint', name: 'installation_stratum', nullable: true })
  installationStratum: number | null;

  @Column({ type: 'uuid', name: 'stratum_evidence_media_id', nullable: true })
  stratumEvidenceMediaId: string | null;

  @Column({ type: 'jsonb', name: 'vat_snapshot', nullable: true })
  vatSnapshot: ContractServicePointSnapshot['vatSnapshot'];

  // ── Add-ons del catálogo ──────────────────────────────────────────────────

  @Column({ type: 'jsonb', name: 'additional_product_ids', default: [] })
  additionalProductIds: string[];

  @Column({ type: 'jsonb', name: 'additional_service_ids', default: [] })
  additionalServiceIds: string[];

  // ── Facturación por servicio ──────────────────────────────────────────────

  @Column({ type: 'varchar', length: 30, name: 'payment_method', nullable: true })
  paymentMethod: string | null;

  @Column({ type: 'varchar', length: 20, name: 'billing_cycle', nullable: true })
  billingCycle: string | null;

  @Column({ type: 'varchar', length: 200, name: 'fiscal_name', nullable: true })
  fiscalName: string | null;

  @Column({ type: 'varchar', length: 30, name: 'fiscal_document', nullable: true })
  fiscalDocument: string | null;

  @Column({
    type: 'varchar',
    length: 500,
    name: 'fiscal_document_encrypted',
    nullable: true,
    select: false,
  })
  fiscalDocumentEncrypted?: string | null;

  @Column({
    type: 'varchar',
    length: 64,
    name: 'fiscal_document_hmac',
    nullable: true,
    select: false,
  })
  fiscalDocumentHmac?: string | null;

  @Column({ type: 'varchar', length: 255, name: 'fiscal_address', nullable: true })
  fiscalAddress: string | null;

  // ── Vigencia ──────────────────────────────────────────────────────────────

  @Column({ type: 'date', name: 'start_date', nullable: true })
  startDate: string | null;

  @Column({ type: 'date', name: 'end_date', nullable: true })
  endDate: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
