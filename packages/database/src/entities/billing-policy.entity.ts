import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'billing_policy' })
export class BillingPolicy {
  @PrimaryColumn({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'period_timing', type: 'varchar', length: 12, default: 'ANTICIPADO' })
  periodTiming: string;

  @Column({ name: 'generation_lead_days', type: 'smallint', default: 0 })
  generationLeadDays: number;

  @Column({ name: 'cutoff_mode', type: 'varchar', length: 24, default: 'DIA_FIJO_CICLO' })
  cutoffMode: string;

  @Column({ name: 'payment_term_days', type: 'smallint', default: 14 })
  paymentTermDays: number;

  @Column({ name: 'grace_days', type: 'smallint', default: 0 })
  graceDays: number;

  @Column({ name: 'cutoff_enabled', type: 'boolean', default: true })
  cutoffEnabled: boolean;

  @Column({
    name: 'minimum_unpaid_for_cutoff',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
  })
  minimumUnpaidForCutoff: string;

  @Column({ name: 'proration_method', type: 'varchar', length: 12, default: 'DIAS_REALES' })
  prorationMethod: string;

  @Column({ name: 'first_period_mode', type: 'varchar', length: 20, default: 'SEPARADO' })
  firstPeriodMode: string;

  @Column({ name: 'automatic_generation', type: 'boolean', default: false })
  automaticGeneration: boolean;

  @Column({ name: 'approval_mode', type: 'varchar', length: 12, default: 'BORRADOR' })
  approvalMode: string;

  @Column({ name: 'auto_apply_credit', type: 'boolean', default: true })
  autoApplyCredit: boolean;

  @Column({ name: 'generation_hour', type: 'smallint', default: 6 })
  generationHour: number;

  @Column({ name: 'document_prefix', type: 'varchar', length: 10, default: 'DC' })
  documentPrefix: string;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
