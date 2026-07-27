import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Index('idx_execution_order_audit_intent_delivery', ['tenantId', 'deliveredAt', 'nextAttemptAt'])
@Entity({ name: 'execution_order_audit_intents' })
export class ExecutionOrderAuditIntent {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;
  @Column({ name: 'intent_id', type: 'uuid' }) intentId: string;
  @Column({ name: 'actor_ref', type: 'uuid', nullable: true }) actorRef: string | null;
  @Column({ name: 'operation', type: 'varchar', length: 120 }) operation: string;
  @Column({ name: 'resource_ref', type: 'varchar', length: 160 }) resourceRef: string;
  @Column({ name: 'result_code', type: 'varchar', length: 64 }) resultCode: string;
  @Column({ name: 'correlation_id', type: 'uuid' }) correlationId: string;
  @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true }) deliveredAt: Date | null;
  @Column({ name: 'attempt_count', type: 'integer', default: 0 }) attemptCount: number;
  @Column({ name: 'next_attempt_at', type: 'timestamptz', nullable: true })
  nextAttemptAt: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}
