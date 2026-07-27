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
@Index('idx_execution_orders_template_version', ['templateVersionId'])
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

  @Column({ name: 'task_id', type: 'varchar', length: 160, nullable: true })
  taskId: string | null;

  @Column({ name: 'ticket_id', type: 'varchar', length: 160, nullable: true })
  ticketId: string | null;

  @Column({ name: 'subscriber_id', type: 'varchar', length: 160, nullable: true })
  subscriberId: string | null;

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

  /** Control optimista de concurrencia; se incrementa en cada mutación. */
  @Column({ type: 'integer', default: 1 })
  version: number;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @Column({ name: 'close_notes', type: 'text', nullable: true })
  closeNotes: string | null;

  // ── Template reference (frozen snapshot on OT creation) ─────────────

  /** ID de la plantilla aplicada (referencia al catálogo). */
  @Column({ name: 'template_id', type: 'uuid', nullable: true })
  templateId: string | null;

  /** ID de la versión de plantilla aplicada. */
  @Column({ name: 'template_version_id', type: 'uuid', nullable: true })
  templateVersionId: string | null;

  /** Clave de la plantilla (e.g., "instalacion-fibra-estandar"). */
  @Column({ name: 'template_key', type: 'varchar', length: 64, nullable: true })
  templateKey: string | null;

  /** Número de versión aplicada. */
  @Column({ name: 'template_version_number', type: 'integer', nullable: true })
  templateVersionNumber: number | null;

  /** Etiqueta visible de la versión (e.g., "Instalación fibra — v3"). */
  @Column({ name: 'template_label', type: 'varchar', length: 200, nullable: true })
  templateLabel: string | null;

  /**
   * Snapshot inmutable de los requisitos de plantilla al crearse la OT.
   * Se evalúa contra este snapshot en el gate de cierre, no contra la
   * plantilla viva (que puede haber cambiado desde entonces).
   */
  @Column({ name: 'template_requirements_snapshot', type: 'jsonb', nullable: true })
  templateRequirementsSnapshot: object | null;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId: string | null;

  @Column({ name: 'updated_by_user_id', type: 'uuid', nullable: true })
  updatedByUserId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
