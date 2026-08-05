import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ScheduleEventStatus, WfmWorkType } from '@iwana/shared';

/**
 * Entidad ScheduleEvent — schema por tenant (dinamico via search_path).
 *
 * Representa un evento programado en la agenda operativa del ISP.
 * Puede vincularse opcionalmente a una WorkOrder, expediente, suscriptor,
 * ticket, contrato u otras referencias cross-module por ID logico.
 *
 * Sin @Entity({ schema }) — TypeORM genera referencias sin calificar.
 * PostgreSQL las resuelve via SET LOCAL search_path al inicio de cada
 * transaccion (ADR-037, ADR-018).
 *
 * HLD-MOD09-PROGRAMACION-WFM-v1.0 §4, SPEC-MOD09 §6.1
 */
@Index('idx_schedule_events_tenant_start', ['tenantId', 'scheduledStartAt'], {
  where: '"deleted_at" IS NULL',
})
@Index(
  'idx_schedule_events_tenant_assigned_start',
  ['tenantId', 'assignedUserId', 'scheduledStartAt'],
  {
    where: '"deleted_at" IS NULL',
  },
)
@Index('idx_schedule_events_tenant_status_start', ['tenantId', 'status', 'scheduledStartAt'], {
  where: '"deleted_at" IS NULL',
})
@Index('idx_schedule_events_tenant_expediente', ['tenantId', 'expedienteId'], {
  where: '"expediente_id" IS NOT NULL AND "deleted_at" IS NULL',
})
@Index('idx_schedule_events_tenant_ticket', ['tenantId', 'ticketId'], {
  where: '"ticket_id" IS NOT NULL AND "deleted_at" IS NULL',
})
@Entity({ name: 'schedule_events' }) // Sin schema — resuelto via SET LOCAL search_path
export class ScheduleEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** FK logica a public.tenants.id — sin FK referencial cross-schema */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  /**
   * Referencia canonica a work_orders.id dentro del mismo schema tenant.
   * La capa de servicios debe sincronizar este campo con `WorkOrder.scheduledEventId`
   * en la misma transaccion para evitar drift entre ambos lados de la relacion.
   */
  @Column({ name: 'work_order_id', type: 'uuid', nullable: true })
  workOrderId: string | null;

  @Column({ name: 'execution_order_id', type: 'uuid', nullable: true })
  executionOrderId: string | null;

  @Column({ type: 'enum', enum: WfmWorkType })
  type: WfmWorkType;

  @Column({ type: 'enum', enum: ScheduleEventStatus, default: ScheduleEventStatus.DRAFT })
  status: ScheduleEventStatus;

  @Column({ type: 'varchar', length: 160 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'scheduled_start_at', type: 'timestamptz' })
  scheduledStartAt: Date;

  @Column({ name: 'scheduled_end_at', type: 'timestamptz' })
  scheduledEndAt: Date;

  /** ID del usuario tecnico, soporte, NOC o contratista asignado (ref logica a users.id) */
  @Column({ name: 'assigned_user_id', type: 'uuid' })
  assignedUserId: string;

  /** Reservado para cuadrillas futuras */
  @Column({ name: 'assigned_team_id', type: 'uuid', nullable: true })
  assignedTeamId: string | null;

  /** Sede organizacional desde donde se atiende la agenda; opcional */
  @Column({ name: 'organization_site_id', type: 'uuid', nullable: true })
  organizationSiteId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  municipality: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  sector: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
  latitude: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
  longitude: string | null;

  /** Vinculo CRM — referencia logica a expediente_records.id */
  @Column({ name: 'expediente_id', type: 'uuid', nullable: true })
  expedienteId: string | null;

  /** Vinculo suscriptor — referencia logica a subscribers.id */
  @Column({ name: 'subscriber_id', type: 'uuid', nullable: true })
  subscriberId: string | null;

  /** Vinculo Service Assurance o referencia externa; puede ser ID o codigo semantico */
  @Column({ name: 'ticket_id', type: 'varchar', length: 160, nullable: true })
  ticketId: string | null;

  /** Vinculo contrato — referencia logica a contracts.id */
  @Column({ name: 'contract_id', type: 'uuid', nullable: true })
  contractId: string | null;

  /** ID del tecnico que reporto la causa de no realizacion (ADR-077 D2) */
  @Column({ name: 'cause_reported_by_id', type: 'uuid', nullable: true })
  causeReportedById: string | null;

  /** Timestamp del reporte de causa por el tecnico */
  @Column({ name: 'cause_reported_at', type: 'timestamptz', nullable: true })
  causeReportedAt: Date | null;

  /** ID del coordinador que reviso/reclasifico la causa (ADR-077 D2) */
  @Column({ name: 'cause_reviewed_by_id', type: 'uuid', nullable: true })
  causeReviewedById: string | null;

  /** Timestamp de la revision/reclasificacion por el coordinador */
  @Column({ name: 'cause_reviewed_at', type: 'timestamptz', nullable: true })
  causeReviewedAt: Date | null;

  /** FK a non_realization_causes.id — clasificacion del tecnico (se conserva). */
  @Column({ name: 'non_realization_cause_id', type: 'uuid', nullable: true })
  nonRealizationCauseId: string | null;

  /** FK a non_realization_causes.id — clasificacion del coordinador (autoritativa). */
  @Column({ name: 'reviewed_cause_id', type: 'uuid', nullable: true })
  reviewedCauseId: string | null;

  /** Si el tecnico subio evidencia del intento fallido. Requisito para pausar SLA. */
  @Column({ name: 'evidence_submitted', type: 'boolean', default: false })
  evidenceSubmitted: boolean;

  /** Descripcion del fallo registrada por el tecnico (ADR-077 D2). */
  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason: string | null;

  /** Notas del coordinador al revisar/reclasificar la causa (ADR-077 D2). */
  @Column({ name: 'review_notes', type: 'text', nullable: true })
  reviewNotes: string | null;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
