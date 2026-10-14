import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type DataAuthorizationPurpose =
  | 'TRATAMIENTO_CONTRACTUAL'
  | 'CONTACTO_COMERCIAL'
  | 'REPORTE_CENTRALES_RIESGO'
  | 'DATOS_BIOMETRICOS';
export type DataAuthorizationKind = 'GRANT' | 'REVOCATION' | 'LEGACY_IMPORT';

@Entity({ name: 'data_authorizations' })
@Index('idx_data_authorizations_party_purpose_captured', ['partyId', 'purpose', 'capturedAt'])
@Index('uq_data_authorizations_source_ref', ['sourceRef'], {
  unique: true,
  where: '"source_ref" IS NOT NULL',
})
export class DataAuthorizationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'party_id', type: 'uuid' })
  partyId: string;

  @Column({ type: 'text' })
  purpose: DataAuthorizationPurpose;

  @Column({ type: 'text' })
  kind: DataAuthorizationKind;

  @Column({ type: 'boolean' })
  granted: boolean;

  @Column({ type: 'text' })
  channel: string;

  @Column({ name: 'evidence_media_id', type: 'uuid', nullable: true })
  evidenceMediaId: string | null;

  @Column({ name: 'legal_text_id', type: 'uuid', nullable: true })
  legalTextId: string | null;

  @Column({ type: 'inet', nullable: true })
  ip: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;

  @Column({ name: 'captured_by', type: 'uuid', nullable: true })
  capturedBy: string | null;

  @Column({ name: 'captured_at', type: 'timestamptz', default: () => 'now()' })
  capturedAt: Date;

  @Column({ name: 'source_ref', type: 'text', nullable: true })
  sourceRef: string | null;
}
