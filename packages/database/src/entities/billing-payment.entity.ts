import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity({ name: 'billing_payments' })
@Unique('uq_billing_payments_tenant_idempotency', ['tenantId', 'idempotencyKey'])
export class BillingPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'subscriber_id', type: 'uuid' })
  subscriberId: string;

  @Column({ name: 'method', type: 'varchar', length: 20 })
  method: string;

  @Column({ name: 'amount', type: 'numeric', precision: 14, scale: 2 })
  amount: string;

  @Column({ name: 'paid_at', type: 'date' })
  paidAt: string;

  @Column({ name: 'reference', type: 'varchar', length: 80, nullable: true })
  reference: string | null;

  @Column({ name: 'note', type: 'varchar', length: 500, nullable: true })
  note: string | null;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 80 })
  idempotencyKey: string;

  @Column({ name: 'allocations_fingerprint', type: 'char', length: 64, nullable: true })
  allocationsFingerprint: string | null;

  @Column({ name: 'status', type: 'varchar', length: 10, default: 'REGISTRADO' })
  status: string;

  @Column({ name: 'void_reason_code', type: 'varchar', length: 40, nullable: true })
  voidReasonCode: string | null;

  @Column({ name: 'void_note', type: 'varchar', length: 500, nullable: true })
  voidNote: string | null;

  @Column({ name: 'voided_at', type: 'timestamptz', nullable: true })
  voidedAt: Date | null;

  @Column({ name: 'voided_by', type: 'uuid', nullable: true })
  voidedBy: string | null;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
