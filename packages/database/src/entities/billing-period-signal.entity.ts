import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'billing_period_signals' })
export class BillingPeriodSignal {
  @PrimaryColumn({ name: 'period_id', type: 'uuid' })
  periodId: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'paid', type: 'boolean' })
  paid: boolean;

  @UpdateDateColumn({ name: 'changed_at', type: 'timestamptz' })
  changedAt: Date;
}
