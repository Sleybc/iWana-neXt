import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'billing_contract_policy' })
export class BillingContractPolicy {
  @PrimaryColumn({ name: 'contract_id', type: 'uuid' })
  contractId: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'period_timing', type: 'varchar', length: 12, nullable: true })
  periodTiming: string | null;

  @Column({ name: 'generation_lead_days', type: 'smallint', nullable: true })
  generationLeadDays: number | null;

  @Column({ name: 'payment_term_days', type: 'smallint', nullable: true })
  paymentTermDays: number | null;

  @Column({ name: 'grace_days', type: 'smallint', nullable: true })
  graceDays: number | null;

  @Column({ name: 'cutoff_enabled', type: 'boolean', nullable: true })
  cutoffEnabled: boolean | null;

  @Column({ name: 'first_period_mode', type: 'varchar', length: 20, nullable: true })
  firstPeriodMode: string | null;

  @Column({ name: 'billing_start_date', type: 'date', nullable: true })
  billingStartDate: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
