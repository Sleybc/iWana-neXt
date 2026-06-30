import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Index('idx_execution_order_activities_order', ['executionOrderId', 'createdAt'])
@Entity({ name: 'execution_order_activities' })
export class ExecutionOrderActivity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'execution_order_id', type: 'uuid' })
  executionOrderId: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'activity_type', type: 'varchar', length: 64 })
  activityType: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
