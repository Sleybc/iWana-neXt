import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Entidad ScheduleRescheduleLog — schema por tenant (dinamico via search_path).
 *
 * Historial append-only de reagendamientos. No tiene updatedAt ni deletedAt
 * por diseno: cada registro es inmutable desde su creacion.
 *
 * Sin @Entity({ schema }) — resuelto via SET LOCAL search_path (ADR-037, ADR-018).
 *
 * HLD-MOD09-PROGRAMACION-WFM-v1.0 §4, SPEC-MOD09 §6.4
 */
@Index('idx_reschedule_logs_tenant_event', ['tenantId', 'scheduleEventId'])
@Entity({ name: 'schedule_reschedule_logs' }) // Sin schema — resuelto via SET LOCAL search_path
export class ScheduleRescheduleLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** FK logica a public.tenants.id — sin FK referencial cross-schema */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  /** Referencia al evento de agenda reagendado */
  @Column({ name: 'schedule_event_id', type: 'uuid' })
  scheduleEventId: string;

  @Column({ name: 'from_start_at', type: 'timestamptz' })
  fromStartAt: Date;

  @Column({ name: 'from_end_at', type: 'timestamptz' })
  fromEndAt: Date;

  @Column({ name: 'to_start_at', type: 'timestamptz' })
  toStartAt: Date;

  @Column({ name: 'to_end_at', type: 'timestamptz' })
  toEndAt: Date;

  /** Motivo obligatorio del reagendamiento */
  @Column({ type: 'varchar', length: 120 })
  reason: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'changed_by', type: 'uuid' })
  changedBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
