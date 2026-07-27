import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Index('uq_execution_order_inbox_event_consumer', ['tenantId', 'consumer', 'eventId'], {
  unique: true,
})
@Index('idx_execution_order_inbox_aggregate_version', [
  'tenantId',
  'consumer',
  'aggregateId',
  'aggregateVersion',
])
@Entity({ name: 'execution_order_inbox_events' })
export class ExecutionOrderInboxEvent {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;
  @Column({ name: 'consumer', type: 'varchar', length: 120 }) consumer: string;
  @Column({ name: 'event_id', type: 'uuid' }) eventId: string;
  @Column({ name: 'aggregate_id', type: 'uuid' }) aggregateId: string;
  @Column({ name: 'aggregate_version', type: 'integer' }) aggregateVersion: number;
  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true }) processedAt: Date | null;
  @Column({ name: 'last_error', type: 'text', nullable: true }) lastError: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}
