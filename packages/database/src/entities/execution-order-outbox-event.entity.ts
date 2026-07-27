import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { OperationalEventPayloadV1 } from '@iwana/shared';

@Index('uq_execution_order_outbox_event', ['tenantId', 'eventId'], { unique: true })
@Index('idx_execution_order_outbox_pending', ['publishedAt', 'availableAt', 'leaseUntil'])
@Entity({ name: 'execution_order_outbox_events' })
export class ExecutionOrderOutboxEvent {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'event_id', type: 'uuid' }) eventId: string;
  @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;
  @Column({ name: 'aggregate_id', type: 'uuid' }) aggregateId: string;
  @Column({ name: 'aggregate_version', type: 'integer' }) aggregateVersion: number;
  @Column({ name: 'event_type', type: 'varchar', length: 120 }) eventType: string;
  @Column({ type: 'jsonb' }) payload: OperationalEventPayloadV1;
  @Column({ name: 'correlation_id', type: 'uuid' }) correlationId: string;
  @Column({ name: 'attempt_count', type: 'integer', default: 0 }) attemptCount: number;
  @Column({ name: 'occurred_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  occurredAt: Date;
  @Column({ name: 'available_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  availableAt: Date;
  @Column({ name: 'lease_until', type: 'timestamptz', nullable: true }) leaseUntil: Date | null;
  @Column({ name: 'published_at', type: 'timestamptz', nullable: true }) publishedAt: Date | null;
  @Column({ name: 'last_error', type: 'text', nullable: true }) lastError: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}
