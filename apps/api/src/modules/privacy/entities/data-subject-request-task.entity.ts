import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestTaskKind } from '@iwana/shared';

export type DataSubjectRequestTaskKind = RequestTaskKind;

@Entity({ name: 'data_subject_request_tasks' })
@Index('idx_data_subject_request_tasks_request_due', ['requestId', 'dueAt'])
export class DataSubjectRequestTaskEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'request_id', type: 'uuid' })
  requestId: string;

  @Column({ type: 'varchar', length: 40 })
  kind: DataSubjectRequestTaskKind;

  @Column({ name: 'due_at', type: 'date' })
  dueAt: string;

  @Column({ name: 'done_at', type: 'timestamptz', nullable: true })
  doneAt: Date | null;

  @Column({ name: 'done_by', type: 'uuid', nullable: true })
  doneBy: string | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;
}
