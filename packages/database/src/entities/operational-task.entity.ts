import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  TaskExecutionMode,
  TaskOriginContext,
  TaskPriority,
  TaskRecipientType,
  TaskResponsibleType,
  TaskStatus,
  TaskType,
} from '@iwana/shared';

/**
 * Entidad OperationalTask — schema por tenant (dinamico via search_path).
 * Owner MOD11: trabajo ejecutable transversal con responsable y destinatario explicitos.
 */
@Index('uq_operational_tasks_tenant_number', ['tenantId', 'taskNumber'], { unique: true })
@Index('idx_operational_tasks_tenant_status', ['tenantId', 'status'])
@Index('idx_operational_tasks_tenant_responsible', ['tenantId', 'responsibleRefId'])
@Index('idx_operational_tasks_tenant_recipient', ['tenantId', 'recipientRefId'])
@Index('idx_operational_tasks_tenant_origin', ['tenantId', 'originContext', 'originRefId'])
@Index('idx_operational_tasks_tenant_due_at', ['tenantId', 'dueAt'])
@Entity({ name: 'operational_tasks' })
export class OperationalTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'task_number', type: 'varchar', length: 30 })
  taskNumber: string;

  @Column({ type: 'enum', enum: TaskType, enumName: 'task_type' })
  type: TaskType;

  @Column({ type: 'enum', enum: TaskStatus, enumName: 'task_status', default: TaskStatus.OPEN })
  status: TaskStatus;

  @Column({
    type: 'enum',
    enum: TaskPriority,
    enumName: 'task_priority',
    default: TaskPriority.NORMAL,
  })
  priority: TaskPriority;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    name: 'origin_context',
    type: 'enum',
    enum: TaskOriginContext,
    enumName: 'task_origin_context',
  })
  originContext: TaskOriginContext;

  @Column({ name: 'origin_ref_id', type: 'varchar', length: 160, nullable: true })
  originRefId: string | null;

  @Column({ name: 'ticket_id', type: 'varchar', length: 160, nullable: true })
  ticketId: string | null;

  @Column({
    name: 'responsible_type',
    type: 'enum',
    enum: TaskResponsibleType,
    enumName: 'task_responsible_type',
  })
  responsibleType: TaskResponsibleType;

  @Column({ name: 'responsible_ref_id', type: 'varchar', length: 160 })
  responsibleRefId: string;

  @Column({
    name: 'recipient_type',
    type: 'enum',
    enum: TaskRecipientType,
    enumName: 'task_recipient_type',
  })
  recipientType: TaskRecipientType;

  @Column({ name: 'recipient_ref_id', type: 'varchar', length: 160, nullable: true })
  recipientRefId: string | null;

  @Column({ name: 'recipient_label', type: 'varchar', length: 160, nullable: true })
  recipientLabel: string | null;

  @Column({ name: 'queue_name', type: 'varchar', length: 80, nullable: true })
  queueName: string | null;

  @Column({
    name: 'execution_mode',
    type: 'enum',
    enum: TaskExecutionMode,
    enumName: 'task_execution_mode',
  })
  executionMode: TaskExecutionMode;

  @Column({ name: 'due_at', type: 'timestamptz', nullable: true })
  dueAt: Date | null;

  @Column({ name: 'scheduled_required', type: 'boolean', default: false })
  scheduledRequired: boolean;

  @Column({ name: 'schedule_event_id', type: 'varchar', length: 160, nullable: true })
  scheduleEventId: string | null;

  @Column({ name: 'work_order_id', type: 'varchar', length: 160, nullable: true })
  workOrderId: string | null;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId: string | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
