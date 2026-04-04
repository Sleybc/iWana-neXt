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
 * Entidad hijo: Intentos de contacto con el prospecto
 * PRD v2.0 §6.3
 */
@Entity({ name: 'contact_attempts' })
@Index('idx_contact_attempts_expediente', ['tenantId', 'expedienteId'])
export class ContactAttempt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'uuid', name: 'expediente_id' })
  expedienteId: string;

  @Column({ type: 'timestamptz', name: 'attempted_at' })
  attemptedAt: Date;

  @Column({ type: 'varchar', length: 30, name: 'channel' })
  channel: string;

  @Column({ type: 'varchar', length: 30, name: 'result' })
  result: string;

  @Column({ type: 'smallint', name: 'duration_minutes', nullable: true })
  durationMinutes: number | null;

  @Column({ type: 'text', name: 'notes', nullable: true })
  notes: string | null;

  @Column({ type: 'uuid', name: 'advisor_id' })
  advisorId: string;

  @Column({ type: 'varchar', length: 160, name: 'actor_name', nullable: true })
  actorName: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => ExpedienteRecord, (expediente) => expediente.contactAttempts)
  @JoinColumn({ name: 'expediente_id' })
  expediente: ExpedienteRecord;
}
