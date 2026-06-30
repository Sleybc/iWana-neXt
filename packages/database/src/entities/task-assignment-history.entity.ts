import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { TaskResponsibleType } from '@iwana/shared';

/**
 * Entidad TaskAssignmentHistory — schema por tenant (dinamico via search_path).
 * Historial de handoff entre responsables activos.
 */
@Index('idx_task_assignment_history_task', ['taskId', 'createdAt'])
@Entity({ name: 'task_assignment_history' })
export class TaskAssignmentHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'task_id', type: 'uuid' })
  taskId: string;

  @Column({ name: 'previous_responsible_type', type: 'enum', enum: TaskResponsibleType })
  previousResponsibleType: TaskResponsibleType;

  @Column({ name: 'previous_responsible_ref_id', type: 'varchar', length: 160 })
  previousResponsibleRefId: string;

  @Column({ name: 'new_responsible_type', type: 'enum', enum: TaskResponsibleType })
  newResponsibleType: TaskResponsibleType;

  @Column({ name: 'new_responsible_ref_id', type: 'varchar', length: 160 })
  newResponsibleRefId: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reason: string | null;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
