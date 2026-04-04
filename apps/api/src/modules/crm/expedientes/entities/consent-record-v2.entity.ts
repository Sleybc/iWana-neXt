import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ExpedienteRecord } from './expediente-record.entity';

/**
 * Entidad hijo: Consentimiento versión 2 con 3 tipos (Ley 1581)
 * PRD v2.0 §4.7, §6.3
 */
@Entity({ name: 'consent_records' })
@Index('idx_consent_records_expediente', ['tenantId', 'expedienteId'])
@Index('idx_consent_records_type', ['tenantId', 'consentType'])
export class ConsentRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'uuid', name: 'expediente_id' })
  expedienteId: string;

  /**
   * Compatibilidad legacy: algunos schemas aún conservan la columna histórica
   * prospect_id con NOT NULL. Se mantiene para evitar 500 mientras se completa
   * la migración estructural total de consent_records.
   */
  @Column({ type: 'uuid', name: 'prospect_id', nullable: true })
  legacyProspectId: string | null;

  @Column({ type: 'varchar', length: 30, name: 'consent_type' })
  consentType: string;

  @Column({ type: 'varchar', length: 30, name: 'status' })
  status: string;

  /**
   * Compatibilidad legacy: estado booleano histórico (accepted) coexistiendo con status.
   */
  @Column({ type: 'boolean', name: 'accepted', nullable: true })
  legacyAccepted: boolean | null;

  @Column({ type: 'varchar', length: 120, name: 'channel' })
  channel: string;

  @Column({ type: 'timestamptz', name: 'obtained_at' })
  obtainedAt: Date;

  @Column({ type: 'varchar', length: 64, name: 'ip_address', nullable: true })
  ipAddress: string | null;

  @Column({ type: 'text', name: 'legal_text_version' })
  legalTextVersion: string;

  @Column({ type: 'varchar', length: 255, name: 'evidence_ref', nullable: true })
  evidenceRef: string | null;

  @Column({ type: 'timestamptz', name: 'revoked_at', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'varchar', length: 255, name: 'revoked_reason', nullable: true })
  revokedReason: string | null;

  @Column({ type: 'uuid', name: 'revoked_by', nullable: true })
  revokedBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;

  @ManyToOne(() => ExpedienteRecord, (expediente) => expediente.consents)
  @JoinColumn({ name: 'expediente_id' })
  expediente: ExpedienteRecord;
}
