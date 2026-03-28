import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ExpedienteStatus } from '@iwana/shared';
import { ContactAttempt } from './contact-attempt.entity';
import { ConsentRecord } from './consent-record-v2.entity';
import { CoverageCheck } from './coverage-check.entity';
import { StatusChange } from './status-change.entity';
import { Quote } from '../../quotes/entities/quote.entity';

/**
 * Entidad maestra del Expediente Único Progresivo
 * Reemplaza PotentialLead + ProspectCase del Sprint 01
 * PRD v2.0 §6.1
 */
@Entity({ name: 'expediente_records' })
@Index('idx_expediente_tenant_status', ['tenantId', 'status'])
@Index('idx_expediente_tenant_created', ['tenantId', 'createdAt'])
@Index('idx_expediente_tenant_municipality', ['tenantId', 'municipality'])
export class ExpedienteRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId: string;

  @Column({
    type: 'enum',
    enum: ExpedienteStatus,
    name: 'status',
    default: ExpedienteStatus.NUEVO_POTENCIAL,
  })
  status: ExpedienteStatus;

  @Column({
    type: 'enum',
    enum: ExpedienteStatus,
    name: 'previous_status',
    nullable: true,
  })
  previousStatus: ExpedienteStatus | null;

  @Column({ type: 'timestamptz', name: 'status_changed_at' })
  statusChangedAt: Date;

  @Column({ type: 'varchar', length: 255, name: 'discard_reason', nullable: true })
  discardReason: string | null;

  @Column({ type: 'uuid', name: 'assigned_to', nullable: true })
  assignedTo?: string | null;

  @Column({ type: 'boolean', name: 'data_consent_revoked', default: false })
  dataConsentRevoked?: boolean;

  // ===== SECCIÓN 1: IDENTIFICACIÓN =====
  @Column({ type: 'varchar', length: 160, name: 'full_name' })
  fullName: string;

  @Column({ type: 'varchar', length: 20, name: 'document_type', nullable: true })
  documentType: string | null;

  @Column({ type: 'varchar', length: 255, name: 'document_number_encrypted', nullable: true })
  documentNumberEncrypted: string | null;

  @Column({ type: 'varchar', length: 20, name: 'gender', nullable: true })
  gender: string | null;

  @Column({ type: 'date', name: 'birth_date', nullable: true })
  birthDate: Date | null;

  @Column({ type: 'varchar', length: 20, name: 'person_type', nullable: true })
  personType: string | null;

  @Column({ type: 'varchar', length: 200, name: 'company_name', nullable: true })
  companyName: string | null;

  @Column({ type: 'varchar', length: 160, name: 'first_name', nullable: true })
  firstName: string | null;

  @Column({ type: 'varchar', length: 160, name: 'last_name', nullable: true })
  lastName: string | null;

  @Column({ type: 'varchar', length: 160, name: 'primary_contact_name', nullable: true })
  primaryContactName: string | null;

  @Column({ type: 'varchar', length: 120, name: 'primary_contact_role', nullable: true })
  primaryContactRole: string | null;

  // ===== SECCIÓN 2: CONTACTO =====
  @Column({ type: 'varchar', length: 255, name: 'phone_primary_encrypted', nullable: true })
  phonePrimaryEncrypted: string | null;

  @Column({ type: 'varchar', length: 255, name: 'phone_secondary_encrypted', nullable: true })
  phoneSecondaryEncrypted: string | null;

  @Column({ type: 'varchar', length: 255, name: 'email_primary_encrypted', nullable: true })
  emailPrimaryEncrypted: string | null;

  @Column({ type: 'varchar', length: 255, name: 'email_secondary', nullable: true })
  emailSecondary: string | null;

  @Column({ type: 'varchar', length: 160, name: 'alt_contact_name', nullable: true })
  altContactName: string | null;

  @Column({ type: 'varchar', length: 255, name: 'alt_contact_phone_encrypted', nullable: true })
  altContactPhoneEncrypted: string | null;

  @Column({ type: 'varchar', length: 30, name: 'contact_preference', nullable: true })
  contactPreference: string | null;

  @Column({ type: 'varchar', length: 60, name: 'best_contact_time', nullable: true })
  bestContactTime: string | null;

  // ===== SECCIÓN 3: UBICACIÓN =====
  @Column({ type: 'varchar', length: 255, name: 'address', nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 120, name: 'municipality', nullable: true })
  municipality: string | null;

  @Column({ type: 'varchar', length: 120, name: 'department', nullable: true })
  department: string | null;

  @Column({ type: 'smallint', name: 'stratum', nullable: true })
  stratum: number | null;

  @Column({ type: 'varchar', length: 120, name: 'neighborhood', nullable: true })
  neighborhood: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 7, name: 'latitude', nullable: true })
  latitude: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 7, name: 'longitude', nullable: true })
  longitude: number | null;

  @Column({ type: 'varchar', length: 20, name: 'coordinates_source', nullable: true })
  coordinatesSource: string | null;

  @Column({ type: 'varchar', length: 20, name: 'coordinates_confidence', nullable: true })
  coordinatesConfidence: string | null;

  @Column({ type: 'text', name: 'access_references', nullable: true })
  accessReferences: string | null;

  @Column({ type: 'varchar', length: 20, name: 'zone_type', nullable: true })
  zoneType: string | null;

  // ===== SECCIÓN 4: INTERÉS COMERCIAL =====
  @Column({ type: 'varchar', length: 120, name: 'source' })
  source: string;

  @Column({ type: 'varchar', length: 120, name: 'interested_plan_id', nullable: true })
  interestedPlanId: string | null;

  @Column({ type: 'varchar', length: 120, name: 'campaign', nullable: true })
  campaign: string | null;

  @Column({ type: 'varchar', length: 20, name: 'case_priority', nullable: true })
  casePriority: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, name: 'estimated_budget', nullable: true })
  estimatedBudget: number | null;

  @Column({ type: 'text', name: 'commercial_notes', nullable: true })
  commercialNotes: string | null;

  // ===== SECCIÓN 5: VIABILIDAD TÉCNICA =====
  @Column({ type: 'varchar', length: 30, name: 'coverage_result', nullable: true })
  coverageResult: string | null;

  @Column({ type: 'varchar', length: 60, name: 'available_technology', nullable: true })
  availableTechnology: string | null;

  @Column({ type: 'integer', name: 'estimated_distance_m', nullable: true })
  estimatedDistanceM: number | null;

  @Column({ type: 'varchar', length: 30, name: 'feasibility', nullable: true })
  feasibility: string | null;

  @Column({ type: 'text', name: 'technical_observations', nullable: true })
  technicalObservations: string | null;

  @Column({ type: 'text', name: 'estimated_equipment', nullable: true })
  estimatedEquipment: string | null;

  // ===== SECCIÓN 6: CONSENTIMIENTO Y LEGAL =====
  @Column({ type: 'varchar', length: 20, name: 'identity_verified', nullable: true })
  identityVerified: string | null;

  @Column({ type: 'varchar', length: 30, name: 'legal_compliance_status', nullable: true })
  legalComplianceStatus: string | null;

  // ===== SECCIÓN 7: FACTURACIÓN Y PAGO =====
  @Column({ type: 'varchar', length: 60, name: 'payment_method', nullable: true })
  paymentMethod: string | null;

  @Column({ type: 'varchar', length: 30, name: 'billing_cycle', nullable: true })
  billingCycle: string | null;

  @Column({ type: 'varchar', length: 200, name: 'fiscal_name', nullable: true })
  fiscalName: string | null;

  @Column({ type: 'varchar', length: 30, name: 'fiscal_document', nullable: true })
  fiscalDocument: string | null;

  @Column({ type: 'varchar', length: 255, name: 'fiscal_address', nullable: true })
  fiscalAddress: string | null;

  @Column({ type: 'varchar', length: 120, name: 'rut_reference', nullable: true })
  rutReference: string | null;

  // ===== SECCIÓN 8: INSTALACIÓN =====
  @Column({ type: 'varchar', length: 255, name: 'installation_address', nullable: true })
  installationAddress: string | null;

  @Column({ type: 'varchar', length: 120, name: 'availability_window', nullable: true })
  availabilityWindow: string | null;

  @Column({ type: 'varchar', length: 160, name: 'site_contact_name', nullable: true })
  siteContactName: string | null;

  @Column({ type: 'varchar', length: 255, name: 'site_contact_phone_encrypted', nullable: true })
  siteContactPhoneEncrypted: string | null;

  @Column({ type: 'text', name: 'special_access_notes', nullable: true })
  specialAccessNotes: string | null;

  @Column({ type: 'text', name: 'required_materials', nullable: true })
  requiredMaterials: string | null;

  // ===== REFERENCIAS OPERATIVAS =====
  @Column({ type: 'varchar', length: 160, name: 'ticket_id', nullable: true })
  ticketId: string | null;

  @Column({ type: 'varchar', length: 160, name: 'work_order_id', nullable: true })
  workOrderId: string | null;

  @Column({ type: 'varchar', length: 160, name: 'inventory_assignment_ref', nullable: true })
  inventoryAssignmentRef: string | null;

  @Column({ type: 'varchar', length: 160, name: 'expansion_request_id', nullable: true })
  expansionRequestId: string | null;

  @Column({ type: 'varchar', length: 160, name: 'execution_policy_ref', nullable: true })
  executionPolicyRef: string | null;

  @Column({ type: 'boolean', name: 'checklist_completed', default: false })
  checklistCompleted: boolean;

  @Column({ type: 'varchar', length: 64, name: 'evidence_mode', nullable: true })
  evidenceMode: string | null;

  @Column({ type: 'varchar', length: 255, name: 'conformity_evidence_ref', nullable: true })
  conformityEvidenceRef: string | null;

  @Column({ type: 'varchar', length: 64, name: 'last_reschedule_reason', nullable: true })
  lastRescheduleReason: string | null;

  @Column({ type: 'text', name: 'last_reschedule_notes', nullable: true })
  lastRescheduleNotes: string | null;

  // ===== COMPLETITUD POR DIMENSIONES =====
  @Column({ type: 'smallint', name: 'completeness_commercial', nullable: true })
  completenessCommercial: number | null;

  @Column({ type: 'smallint', name: 'completeness_legal', nullable: true })
  completenessLegal: number | null;

  @Column({ type: 'smallint', name: 'completeness_technical', nullable: true })
  completenessTechnical: number | null;

  @Column({ type: 'smallint', name: 'completeness_operational', nullable: true })
  completenessOperational: number | null;

  // ===== METADATOS =====
  @Column({ type: 'uuid', name: 'created_by' })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;

  // ===== RELACIONES =====
  @OneToMany(() => ContactAttempt, (attempt) => attempt.expediente)
  contactAttempts: ContactAttempt[];

  @OneToMany(() => ConsentRecord, (consent) => consent.expediente)
  consents: ConsentRecord[];

  @OneToMany(() => CoverageCheck, (check) => check.expediente)
  coverageChecks: CoverageCheck[];

  @OneToMany(() => StatusChange, (change) => change.expediente)
  statusChanges: StatusChange[];
}
