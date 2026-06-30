import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ExecutionOrderResult, ExecutionOrderStatus, WfmWorkType } from '@iwana/shared';

@Index('uq_execution_orders_tenant_number', ['tenantId', 'executionOrderNumber'], { unique: true })
@Index('idx_execution_orders_tenant_status', ['tenantId', 'status'])
@Index('idx_execution_orders_tenant_schedule_event', ['tenantId', 'scheduleEventId'])
@Index('idx_execution_orders_tenant_assigned_technician', ['tenantId', 'assignedTechnicianId'])
@Entity({ name: 'execution_orders' })
export class ExecutionOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'execution_order_number', type: 'varchar', length: 40 })
  executionOrderNumber: string;

  @Column({ name: 'visit_request_id', type: 'uuid', nullable: true })
  visitRequestId: string | null;

  @Column({ name: 'schedule_event_id', type: 'uuid' })
  scheduleEventId: string;

  @Column({ name: 'assigned_technician_id', type: 'uuid', nullable: true })
  assignedTechnicianId: string | null;

  @Column({ name: 'assigned_crew_id', type: 'uuid', nullable: true })
  assignedCrewId: string | null;

  @Column({ name: 'origin_context', type: 'varchar', length: 64 })
  originContext: string;

  @Column({ name: 'origin_ref_id', type: 'varchar', length: 160, nullable: true })
  originRefId: string | null;

  @Column({ name: 'customer_display_label', type: 'varchar', length: 200 })
  customerDisplayLabel: string;

  @Column({ name: 'service_address', type: 'varchar', length: 255, nullable: true })
  serviceAddress: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  municipality: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  sector: string | null;

  @Column({ name: 'work_type', type: 'enum', enum: WfmWorkType, enumName: 'wfm_work_type' })
  workType: WfmWorkType;

  @Column({ name: 'work_summary', type: 'varchar', length: 200 })
  workSummary: string;

  @Column({ name: 'work_instructions', type: 'text', nullable: true })
  workInstructions: string | null;

  @Column({ name: 'planned_window_start_at', type: 'timestamptz' })
  plannedWindowStartAt: Date;

  @Column({ name: 'planned_window_end_at', type: 'timestamptz' })
  plannedWindowEndAt: Date;

  @Column({
    type: 'enum',
    enum: ExecutionOrderStatus,
    enumName: 'execution_order_status',
    default: ExecutionOrderStatus.CREATED,
  })
  status: ExecutionOrderStatus;

  @Column({
    type: 'enum',
    enum: ExecutionOrderResult,
    enumName: 'execution_order_result',
    nullable: true,
  })
  result: ExecutionOrderResult | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @Column({ name: 'close_notes', type: 'text', nullable: true })
  closeNotes: string | null;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId: string | null;

  @Column({ name: 'updated_by_user_id', type: 'uuid', nullable: true })
  updatedByUserId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
