import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WorkOrderTaskStatus } from '@iwana/shared';

/**
 * Entidad WorkOrderTask — schema por tenant (dinamico via search_path).
 *
 * Tareas internas de una Work Order. En Fase 1 puede existir una tarea
 * por defecto; el modelo queda listo para multiples tareas.
 *
 * Sin @Entity({ schema }) — resuelto via SET LOCAL search_path (ADR-037, ADR-018).
 *
 * HLD-MOD09-PROGRAMACION-WFM-v1.0 §4, SPEC-MOD09 §6.3
 */
@Index('idx_work_order_tasks_tenant_work_order', ['tenantId', 'workOrderId'])
@Entity({ name: 'work_order_tasks' }) // Sin schema — resuelto via SET LOCAL search_path
export class WorkOrderTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** FK logica a public.tenants.id — sin FK referencial cross-schema */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  /** Referencia a work_orders.id dentro del mismo schema tenant */
  @Column({ name: 'work_order_id', type: 'uuid' })
  workOrderId: string;

  @Column({ type: 'varchar', length: 160 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: WorkOrderTaskStatus, default: WorkOrderTaskStatus.PENDING })
  status: WorkOrderTaskStatus;

  /** Momento de llegada del tecnico registrado en campo */
  @Column({ name: 'arrival_at', type: 'timestamptz', nullable: true })
  arrivalAt: Date | null;

  /** Momento de salida del tecnico registrado en campo */
  @Column({ name: 'departure_at', type: 'timestamptz', nullable: true })
  departureAt: Date | null;

  @Column({ name: 'result_notes', type: 'text', nullable: true })
  resultNotes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
