import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ProspectCaseStatus } from '../../enums/prospect-case-status.enum';

@Entity({ name: 'prospect_cases' })
@Index('idx_prospect_cases_tenant_status', ['tenantId', 'status'])
@Index('idx_prospect_cases_potential', ['potentialId'])
export class ProspectCase {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'uuid', name: 'potential_id' })
  potentialId: string;

  @Column({ type: 'varchar', length: 180, name: 'full_name' })
  fullName: string;

  @Column({ type: 'varchar', length: 255, name: 'address' })
  address: string;

  @Column({ type: 'varchar', length: 120, name: 'selected_plan_id' })
  selectedPlanId: string;

  @Column({
    type: 'enum',
    enum: ProspectCaseStatus,
    name: 'status',
    default: ProspectCaseStatus.PROSPECT,
  })
  status: ProspectCaseStatus;

  @Column({ type: 'varchar', length: 160, name: 'ticket_id', nullable: true })
  ticketId: string | null;

  @Column({ type: 'varchar', length: 160, name: 'work_order_id', nullable: true })
  workOrderId: string | null;

  @Column({ type: 'varchar', length: 160, name: 'inventory_assignment_ref', nullable: true })
  inventoryAssignmentRef: string | null;

  @Column({ type: 'varchar', length: 160, name: 'expansion_request_id', nullable: true })
  expansionRequestId: string | null;

  @Column({ type: 'varchar', length: 160, name: 'execution_policy_ref', nullable: true })
  executionPolicyRef: string | null;

  @Column({ type: 'boolean', name: 'checklist_completed', default: false })
  checklistCompleted: boolean;

  @Column({ type: 'varchar', length: 64, name: 'evidence_mode', nullable: true })
  evidenceMode: string | null;

  @Column({ type: 'varchar', length: 255, name: 'conformity_evidence_ref', nullable: true })
  conformityEvidenceRef: string | null;

  @Column({ type: 'varchar', length: 64, name: 'last_reschedule_reason', nullable: true })
  lastRescheduleReason: string | null;

  @Column({ type: 'text', name: 'last_reschedule_notes', nullable: true })
  lastRescheduleNotes: string | null;

  @Column({ type: 'jsonb', name: 'coverage_snapshot_json', default: () => "'{}'::jsonb" })
  coverageSnapshotJson: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
