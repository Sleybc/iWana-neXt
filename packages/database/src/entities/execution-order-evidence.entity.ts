import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Index('idx_execution_order_evidence_order', ['executionOrderId', 'createdAt'])
@Entity({ name: 'execution_order_evidence' })
export class ExecutionOrderEvidence {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'execution_order_id', type: 'uuid' })
  executionOrderId: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'evidence_type', type: 'varchar', length: 64 })
  evidenceType: string;

  @Column({ name: 'file_name', type: 'varchar', length: 200, nullable: true })
  fileName: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
