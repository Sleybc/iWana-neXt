import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  PersonType,
  CustomerSegment,
  VatTreatment,
  TaxRegime,
  SubscriberStatus,
  DocumentType,
} from '@iwana/shared';

/**
 * Entidad Subscriber — registro central del suscriptor post-activación.
 *
 * Dos dimensiones ortogonales (ADR-025):
 * - personType (NATURAL | JURIDICA): dimensión fiscal, determina IVA y tipo de documento
 * - customerSegment (RESIDENTIAL | SOHO | PYME | CORPORATE | GOVERNMENT | WHOLESALE):
 *   dimensión de negocio, determina tipo de plan, SLA y provisioning
 *
 * El tratamiento IVA se calcula automáticamente según personType + stratum.
 * customerSegment NO afecta el IVA.
 */
@Entity({ name: 'subscribers' })
@Index('idx_subscribers_tenant_status', ['tenantId', 'status'])
@Index('idx_subscribers_tenant_doc', ['tenantId', 'documentNumberEncrypted'])
@Index('idx_subscribers_tenant_email', ['tenantId', 'emailEncrypted'])
@Index('idx_subscribers_tenant_stratum', ['tenantId', 'stratum'])
@Index('idx_subscribers_tenant_segment', ['tenantId', 'customerSegment'])
@Index('idx_subscribers_tenant_expediente', ['tenantId', 'expedienteId'])
@Index('idx_subscribers_party_id', ['tenantId', 'partyId'], { where: 'party_id IS NOT NULL' })
export class Subscriber {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ── Multi-tenant ──
  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId: string;

  // ── Relación 1:1 con USER (nullable: el subscriber existe antes del portal) ──
  @Column({ type: 'uuid', name: 'user_id', nullable: true })
  userId: string | null;

  // ── Vínculo a Party (MOD08 — ADR-030) ──
  @Column({ type: 'uuid', name: 'party_id', nullable: true })
  partyId: string | null;

  // ── Dimensión fiscal (régimen tributario colombiano) ──
  @Column({ type: 'varchar', length: 20, name: 'person_type' })
  personType: PersonType;

  // ── Dimensión de negocio (segmento ISP) ──
  @Column({ type: 'varchar', length: 20, name: 'customer_segment' })
  customerSegment: CustomerSegment;

  // ── Persona Natural ──
  @Column({ type: 'varchar', length: 20, name: 'document_type', nullable: true })
  documentType: DocumentType | null;

  @Column({ type: 'varchar', length: 500, name: 'document_number_encrypted', nullable: true })
  documentNumberEncrypted: string | null;

  // Hashes SHA-256 para búsqueda determinista sin descifrar (migración 014)
  @Column({ type: 'varchar', length: 64, name: 'document_number_hash', nullable: true })
  documentNumberHash: string | null;

  @Column({ type: 'varchar', length: 64, name: 'email_hash', nullable: true })
  emailHash: string | null;

  @Column({ type: 'varchar', length: 64, name: 'phone_hash', nullable: true })
  phoneHash: string | null;

  @Column({ type: 'varchar', length: 300, name: 'first_name', nullable: true })
  firstName: string | null;

  @Column({ type: 'varchar', length: 300, name: 'last_name', nullable: true })
  lastName: string | null;

  @Column({ type: 'int', name: 'stratum', nullable: true })
  stratum: number | null;

  @Column({ type: 'date', name: 'birth_date', nullable: true })
  birthDate: Date | null;

  // ── Persona Jurídica ──
  @Column({ type: 'varchar', length: 500, name: 'nit', nullable: true })
  nit: string | null;

  @Column({ type: 'varchar', length: 1, name: 'nit_verification_digit', nullable: true })
  nitVerificationDigit: string | null;

  @Column({ type: 'varchar', length: 300, name: 'business_name', nullable: true })
  businessName: string | null;

  @Column({ type: 'varchar', length: 300, name: 'commercial_name', nullable: true })
  commercialName: string | null;

  // Representante legal: FK a otro subscriber (persona natural)
  @Column({ type: 'uuid', name: 'legal_representative_id', nullable: true })
  legalRepresentativeId: string | null;

  // ── Compartido (ambos tipos) ──
  @Column({ type: 'varchar', length: 500, name: 'email_encrypted' })
  emailEncrypted: string;

  @Column({ type: 'varchar', length: 100, name: 'phone_encrypted' })
  phoneEncrypted: string;

  @Column({ type: 'varchar', length: 160, name: 'alt_contact_name', nullable: true })
  altContactName: string | null;

  @Column({ type: 'varchar', length: 100, name: 'alt_contact_phone_encrypted', nullable: true })
  altContactPhoneEncrypted: string | null;

  @Column({ type: 'varchar', length: 50, name: 'whatsapp', nullable: true })
  whatsapp: string | null;

  // ── Fiscal (calculado automáticamente por VatTreatmentService) ──
  @Column({ type: 'varchar', length: 20, name: 'vat_treatment' })
  vatTreatment: VatTreatment;

  @Column({ type: 'varchar', length: 20, name: 'tax_regime' })
  taxRegime: TaxRegime;

  // ── Ubicación ──
  @Column({ type: 'varchar', length: 500, name: 'address' })
  address: string;

  @Column({ type: 'varchar', length: 100, name: 'neighborhood', nullable: true })
  neighborhood: string | null;

  @Column({ type: 'varchar', length: 50, name: 'city', nullable: true })
  city: string | null;

  @Column({ type: 'varchar', length: 50, name: 'department', nullable: true })
  department: string | null;

  @Column({ type: 'varchar', length: 20, name: 'postal_code', nullable: true })
  postalCode: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 7, name: 'latitude', nullable: true })
  latitude: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 7, name: 'longitude', nullable: true })
  longitude: number | null;

  // ── Cobertura ──
  @Column({ type: 'uuid', name: 'coverage_node_id', nullable: true })
  coverageNodeId: string | null;

  // ── Trazabilidad conversión expediente → subscriber ──
  @Column({ type: 'uuid', name: 'expediente_id', nullable: true })
  expedienteId: string | null;

  @Column({ type: 'timestamptz', name: 'converted_at', nullable: true })
  convertedAt: Date | null;

  @Column({ type: 'timestamptz', name: 'activated_at', nullable: true })
  activatedAt: Date | null;

  @Column({ type: 'varchar', name: 'manual_override_reason', length: 500, nullable: true })
  manualOverrideReason: string | null;

  // ── Ciclo de vida ──
  @Column({
    type: 'varchar',
    length: 20,
    name: 'status',
    default: SubscriberStatus.LEAD,
  })
  status: SubscriberStatus;

  @Column({ type: 'varchar', length: 160, name: 'external_id', nullable: true })
  externalId: string | null;

  // ── Auditoría ──
  @Column({ type: 'uuid', name: 'created_by' })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
