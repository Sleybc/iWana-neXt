import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'data_subject_request_events' })
@Index('idx_data_subject_request_events_request', ['requestId', 'occurredAt'])
export class DataSubjectRequestEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'request_id', type: 'uuid' })
  requestId: string;

  @Column({ name: 'from_status', type: 'text', nullable: true })
  fromStatus: string | null;

  @Column({ name: 'to_status', type: 'text' })
  toStatus: string;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ name: 'occurred_at', type: 'timestamptz', default: () => 'now()' })
  occurredAt: Date;
}
