import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity({ name: 'billing_periods' })
@Unique('uq_billing_periods_contract_start', ['contractId', 'periodStart'])
export class BillingPeriod {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'contract_id', type: 'uuid' })
  contractId: string;

  @Column({ name: 'subscriber_id', type: 'uuid' })
  subscriberId: string;

  @Column({ name: 'period_start', type: 'date' })
  periodStart: string;

  @Column({ name: 'period_end', type: 'date' })
  periodEnd: string;

  @Column({ name: 'covered_start', type: 'date' })
  coveredStart: string;

  @Column({ name: 'generation_date', type: 'date' })
  generationDate: string;

  @Column({ name: 'due_date', type: 'date' })
  dueDate: string;

  @Column({ name: 'cutoff_date', type: 'date', nullable: true })
  cutoffDate: string | null;

  @Column({ name: 'effective_policy', type: 'jsonb' })
  effectivePolicy: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
