import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'customer_activations' })
@Index('idx_customer_activations_tenant_prospect', ['tenantId', 'prospectId'])
export class CustomerActivation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'uuid', name: 'prospect_id' })
  prospectId: string;

  @Column({ type: 'varchar', length: 160, name: 'ticket_id' })
  ticketId: string;

  @Column({ type: 'varchar', length: 160, name: 'work_order_id' })
  workOrderId: string;

  @Column({ type: 'varchar', length: 160, name: 'inventory_assignment_ref', nullable: true })
  inventoryAssignmentRef: string | null;

  @Column({ type: 'varchar', length: 64, name: 'evidence_mode' })
  evidenceMode: string;

  @Column({ type: 'varchar', length: 255, name: 'conformity_evidence_ref' })
  conformityEvidenceRef: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
