import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { DocumentTypeParty } from '@iwana/shared';
import type { DataAuthorizationPurpose } from './data-authorization.entity';

export type DataSubjectRequestKind = 'CONSULTA' | 'RECLAMO' | 'SUPLANTACION';
export type DataSubjectRequestStatus =
  | 'RADICADA'
  | 'INCOMPLETA'
  | 'DESISTIDA'
  | 'EN_TRAMITE'
  | 'PRORROGADA'
  | 'RESUELTA'
  | 'NO_PROCEDENTE'
  | 'TRASLADADA';
export type DataSubjectRight =
  | 'CONOCER'
  | 'ACTUALIZAR'
  | 'RECTIFICAR'
  | 'SUPRIMIR'
  | 'REVOCAR'
  | 'PRUEBA_AUTORIZACION'
  | 'INCUMPLIMIENTO';
export type DataSubjectRequesterKind = 'TITULAR' | 'CAUSAHABIENTE' | 'REPRESENTANTE' | 'APODERADO';

@Entity({ name: 'data_subject_requests' })
@Index('idx_data_subject_requests_status_due_at', ['status', 'dueAt'])
@Index('idx_data_subject_requests_party_received_at', ['partyId', 'receivedAt'], {
  where: '"party_id" IS NOT NULL',
})
export class DataSubjectRequestEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'party_id', type: 'uuid', nullable: true })
  partyId: string | null;

  @Column({ name: 'requester_document_hmac', type: 'text', nullable: true })
  requesterDocumentHmac: string | null;

  @Column({ name: 'requester_name_encrypted', type: 'varchar', length: 500, nullable: true })
  requesterNameEncrypted: string | null;

  @Column({ name: 'requester_document_type', type: 'varchar', length: 20, nullable: true })
  requesterDocumentType: DocumentTypeParty | null;

  @Column({ name: 'requester_document_encrypted', type: 'varchar', length: 500, nullable: true })
  requesterDocumentEncrypted: string | null;

  @Column({ name: 'requester_contact_encrypted', type: 'varchar', length: 500, nullable: true })
  requesterContactEncrypted: string | null;

  @Column({ name: 'requester_evidence_media_id', type: 'uuid', nullable: true })
  requesterEvidenceMediaId: string | null;

  @Column({ name: 'identity_verification_method', type: 'varchar', length: 30, nullable: true })
  identityVerificationMethod:
    | 'DOCUMENTO_PRESENCIAL'
    | 'COPIA_DOCUMENTO'
    | 'PODER_O_REPRESENTACION'
    | 'DECLARACION_CAUSAHABIENTE'
    | null;

  @Column({ name: 'identity_verified_at', type: 'timestamptz', nullable: true })
  identityVerifiedAt: Date | null;

  @Column({ name: 'identity_verified_by', type: 'uuid', nullable: true })
  identityVerifiedBy: string | null;

  @Column({ name: 'requester_kind', type: 'text' })
  requesterKind: DataSubjectRequesterKind;

  @Column({ type: 'text' })
  kind: DataSubjectRequestKind;

  @Column({ name: 'right', type: 'text' })
  right: DataSubjectRight;

  @Column({ type: 'text', nullable: true })
  purpose: DataAuthorizationPurpose | null;

  @Column({ type: 'text' })
  status: DataSubjectRequestStatus;

  @Column({ name: 'received_at', type: 'timestamptz' })
  receivedAt: Date;

  @Column({ name: 'complete_at', type: 'timestamptz', nullable: true })
  completeAt: Date | null;

  @Column({ name: 'due_at', type: 'date' })
  dueAt: string;

  @Column({ name: 'impersonation_complaint_due_at', type: 'date', nullable: true })
  impersonationComplaintDueAt: string | null;

  @Column({ name: 'suspended_contract_ids', type: 'uuid', array: true, default: () => "'{}'" })
  suspendedContractIds: string[];

  @Column({ name: 'disputed_contract_ids', type: 'uuid', array: true, default: () => "'{}'" })
  disputedContractIds: string[];

  @Column({ name: 'extended_until', type: 'date', nullable: true })
  extendedUntil: string | null;

  @Column({ name: 'info_required_at', type: 'timestamptz', nullable: true })
  infoRequiredAt: Date | null;

  @Column({ name: 'desist_at', type: 'date', nullable: true })
  desistAt: string | null;

  @Column({ name: 'response_text', type: 'text', nullable: true })
  responseText: string | null;

  @Column({ name: 'response_channel', type: 'text', nullable: true })
  responseChannel: string | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({ name: 'resolved_by', type: 'uuid', nullable: true })
  resolvedBy: string | null;

  @Column({ name: 'transferred_to', type: 'varchar', length: 200, nullable: true })
  transferredTo: string | null;

  @Column({ name: 'legal_basis', type: 'text', nullable: true })
  legalBasis: string | null;
}
