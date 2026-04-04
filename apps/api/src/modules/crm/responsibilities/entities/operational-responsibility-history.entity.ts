import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ExpedienteRecord } from '../../expedientes/entities/expediente-record.entity';

@Entity({ name: 'operational_responsibility_history' })
@Index('idx_op_resp_hist_tenant_expediente_changed_at', ['tenantId', 'expedienteId', 'changedAt'])
@Index('idx_op_resp_hist_tenant_new_responsible', ['tenantId', 'newResponsibleUserId'])
export class OperationalResponsibilityHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'uuid', name: 'expediente_id' })
  expedienteId: string;

  @Column({ type: 'uuid', name: 'previous_responsible_user_id', nullable: true })
  previousResponsibleUserId: string | null;

  @Column({ type: 'uuid', name: 'new_responsible_user_id' })
  newResponsibleUserId: string;

  @Column({ type: 'uuid', name: 'changed_by' })
  changedBy: string;

  @Column({ type: 'timestamptz', name: 'changed_at' })
  changedAt: Date;

  @Column({ type: 'varchar', length: 255, name: 'notes', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => ExpedienteRecord)
  @JoinColumn({ name: 'expediente_id' })
  expediente: ExpedienteRecord;
}
