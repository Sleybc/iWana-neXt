import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Aceptación de la permanencia mínima por contrato (bloque H; migración 183).
 * Sin aceptar, todos los datos van en NULL. La tabla mes 1..N se calcula, no se guarda.
 */
@Entity({ name: 'contract_permanence' })
export class ContractPermanenceRecord {
  @PrimaryColumn({ type: 'uuid', name: 'contract_id' })
  contractId: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'boolean' })
  accepted: boolean;

  @Column({ type: 'smallint', nullable: true })
  months: number | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, name: 'connection_fee', nullable: true })
  connectionFee: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, name: 'discounted_amount', nullable: true })
  discountedAmount: string | null;

  /** Fecha de activación; NULL mientras el contrato no se active. */
  @Column({ type: 'date', name: 'start_date', nullable: true })
  startDate: string | null;

  @Column({ type: 'date', name: 'end_date', nullable: true })
  endDate: string | null;

  /** Días de suspensión voluntaria acumulados que ya corrieron el fin. */
  @Column({ type: 'integer', name: 'voluntary_suspension_days', default: 0 })
  voluntarySuspensionDays: number;

  @Column({ type: 'uuid', name: 'created_by' })
  createdBy: string;

  @Column({ type: 'uuid', name: 'updated_by' })
  updatedBy: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
