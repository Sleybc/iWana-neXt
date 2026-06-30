import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  WfmWorkType,
  WorkOrderPriority,
  WorkOrderSourceContext,
  WorkOrderStatus,
} from '@iwana/shared';

/**
 * Entidad WorkOrder — schema por tenant (dinamico via search_path).
 *
 * Orden operativa ligera vinculada a un evento de agenda.
 * Puede originarse desde CRM, Service Assurance, Provisioning o manualmente.
 *
 * `code` es unico por tenant via indice parcial en la migracion.
 * Sin @Entity({ schema }) — resuelto via SET LOCAL search_path (ADR-037, ADR-018).
 *
 * HLD-MOD09-PROGRAMACION-WFM-v1.0 §4, SPEC-MOD09 §6.2
 */
@Index('uq_work_orders_tenant_code', ['tenantId', 'code'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Index('idx_work_orders_tenant_status', ['tenantId', 'status'], {
  where: '"deleted_at" IS NULL',
})
@Index('idx_work_orders_tenant_assigned', ['tenantId', 'assignedUserId'], {
  where: '"deleted_at" IS NULL',
})
@Entity({ name: 'work_orders' }) // Sin schema — resuelto via SET LOCAL search_path
export class WorkOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** FK logica a public.tenants.id — sin FK referencial cross-schema */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  /** Consecutivo legible, ej. WO-20260506-001 — unicidad por tenant via constraint en migracion */
  @Column({ type: 'varchar', length: 40 })
  code: string;

  @Column({ type: 'enum', enum: WfmWorkType })
  type: WfmWorkType;

  @Column({ type: 'enum', enum: WorkOrderStatus, default: WorkOrderStatus.OPEN })
  status: WorkOrderStatus;

  @Column({ type: 'enum', enum: WorkOrderPriority, default: WorkOrderPriority.NORMAL })
  priority: WorkOrderPriority;

  /** ID del tecnico responsable (ref logica a users.id) */
  @Column({ name: 'assigned_user_id', type: 'uuid' })
  assignedUserId: string;

  /**
   * Vinculo inverso para lectura rapida desde la OT.
   * No debe mutarse de forma independiente: `ScheduleEvent.workOrderId` es la
   * referencia canonica y la capa de servicios debe mantener ambos campos
   * sincronizados dentro de la misma transaccion tenant-aware.
   */
  @Column({ name: 'scheduled_event_id', type: 'uuid', nullable: true })
  scheduledEventId: string | null;

  @Column({ name: 'source_context', type: 'enum', enum: WorkOrderSourceContext })
  sourceContext: WorkOrderSourceContext;

  /** ID externo o referencia semantica del sistema origen */
  @Column({ name: 'source_ref', type: 'varchar', length: 160, nullable: true })
  sourceRef: string | null;

  @Column({ type: 'varchar', length: 200 })
  summary: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @Column({ name: 'closed_by', type: 'uuid', nullable: true })
  closedBy: string | null;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
