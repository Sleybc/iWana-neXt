import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { TaskTimelineEventType } from '@iwana/shared';

/**
 * Entidad TaskTimelineEvent — schema por tenant (dinamico via search_path).
 * Registro append-only del ciclo de vida de una tarea operativa.
 */
@Index('idx_task_timeline_task', ['taskId', 'occurredAt'])
@Entity({ name: 'task_timeline_events' })
export class TaskTimelineEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'task_id', type: 'uuid' })
  taskId: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'event_type', type: 'enum', enum: TaskTimelineEventType })
  eventType: TaskTimelineEventType;

  @Column({ type: 'jsonb', default: {} })
  payload: Record<string, unknown>;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId: string | null;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt: Date;
}
