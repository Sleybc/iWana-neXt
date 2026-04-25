import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ExpedienteRecord } from './expediente-record.entity';

/**
 * Entidad hijo: Cambio de estado del pipeline (auditoría inmutable)
 * PRD v2.0 §6.3
 */
@Entity({ name: 'status_changes' })
@Index('idx_status_changes_expediente', ['tenantId', 'expedienteId'])
@Index('idx_status_changes_changed_at', ['tenantId', 'changedAt'])
export class StatusChange {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'uuid', name: 'expediente_id' })
  expedienteId: string;

  @Column({ type: 'varchar', length: 30, name: 'from_status' })
  fromStatus: string;

  @Column({ type: 'varchar', length: 30, name: 'to_status' })
  toStatus: string;

  @Column({ type: 'timestamptz', name: 'changed_at' })
  changedAt: Date;

  @Column({ type: 'uuid', name: 'changed_by' })
  changedBy: string;

  @Column({ type: 'varchar', length: 160, name: 'actor_name', nullable: true })
  actorName: string | null;

  @Column({ type: 'varchar', length: 255, name: 'reason', nullable: true })
  reason: string | null;

  @Column({ type: 'jsonb', name: 'metadata_json', nullable: true })
  metadataJson: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => ExpedienteRecord, (expediente) => expediente.statusChanges)
  @JoinColumn({ name: 'expediente_id' })
  expediente: ExpedienteRecord;
}
