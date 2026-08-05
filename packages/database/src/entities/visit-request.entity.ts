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
  VisitRequestStatus,
  WorkOrderSourceContext,
  WfmWorkType,
  WorkOrderPriority,
} from '@iwana/shared';

/**
 * Entidad VisitRequest — schema por tenant (dinamico via search_path).
 *
 * Solicitud operativa inicial que origina la creacion de Work Orders y ScheduleEvents.
 * Captura la demanda, contexto de origen, prioridad y datos del solicitante antes de
 * pasar a programacion WFM.
 *
 * Puede generarse desde CRM, Service Assurance, Provisioning o flujos manuales.
 * Status PENDING → NEEDS_CONTEXT → READY_TO_SCHEDULE → SCHEDULED | CANCELLED | REJECTED
 *
 * Sin @Entity({ schema }) — resuelto via SET LOCAL search_path (ADR-037, ADR-018).
 *
 * HLD-MOD09-PROGRAMACION-WFM-v1.0 §4, SPEC-MOD09 §6.2
 */
@Index('idx_visit_requests_tenant_status_created', ['tenantId', 'status', 'createdAt'])
@Entity({ name: 'visit_requests' }) // Sin schema — resuelto via SET LOCAL search_path
export class VisitRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** FK logica a public.tenants.id — sin FK referencial cross-schema */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ type: 'enum', enum: VisitRequestStatus })
  status: VisitRequestStatus;

  /** Contexto de origen — sistema que solicita la visita */
  @Column({ name: 'origin_context', type: 'enum', enum: WorkOrderSourceContext })
  originContext: WorkOrderSourceContext;

  /** ID externo o referencia semantica del sistema origen */
  @Column({ name: 'origin_ref', type: 'varchar', length: 160, nullable: true })
  originRef: string | null;

  /** Etiqueta legible del sistema origen (ej. "Ticket #123", "Expediente EXP-001") */
  @Column({ name: 'origin_label', type: 'varchar', length: 160, nullable: true })
  originLabel: string | null;

  @Column({ name: 'work_type', type: 'enum', enum: WfmWorkType })
  workType: WfmWorkType;

  @Column({ type: 'enum', enum: WorkOrderPriority })
  priority: WorkOrderPriority;

  @Column({ type: 'varchar', length: 160 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Inicio de la ventana temporal solicitada por el negocio */
  @Column({ name: 'requested_window_start_at', type: 'timestamptz', nullable: true })
  requestedWindowStartAt: Date | null;

  /** Fin de la ventana temporal solicitada por el negocio */
  @Column({ name: 'requested_window_end_at', type: 'timestamptz', nullable: true })
  requestedWindowEndAt: Date | null;

  /** Fecha limite de atencion por SLA del negocio */
  @Column({ name: 'sla_due_at', type: 'timestamptz', nullable: true })
  slaDueAt: Date | null;

  /** Sede organizacional sugerida o seleccionada; opcional para tenants monosede */
  @Column({ name: 'organization_site_id', type: 'uuid', nullable: true })
  organizationSiteId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  municipality: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  sector: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
  latitude: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
  longitude: number | null;

  /** FK logica a expediente_records.id — vinculo opcional de contexto CRM */
  @Column({ name: 'expediente_id', type: 'uuid', nullable: true })
  expedienteId: string | null;

  /** FK logica a subscribers.id — vinculo opcional de contexto CRM */
  @Column({ name: 'subscriber_id', type: 'uuid', nullable: true })
  subscriberId: string | null;

  /** ID externo de ticket en Service Assurance — vinculo opcional */
  @Column({ name: 'ticket_id', type: 'varchar', length: 160, nullable: true })
  ticketId: string | null;

  /** FK logica a contracts.id — vinculo opcional de contexto comercial */
  @Column({ name: 'contract_id', type: 'uuid', nullable: true })
  contractId: string | null;

  /** ScheduleEvent generado al programar la visita — vinculo bidireccional */
  @Column({ name: 'schedule_event_id', type: 'uuid', nullable: true })
  scheduleEventId: string | null;

  /** WorkOrder generada al programar la visita — vinculo bidireccional */
  @Column({ name: 'work_order_id', type: 'uuid', nullable: true })
  workOrderId: string | null;

  /** ExecutionOrder generada al confirmar agenda — referencia logica MOD11 */
  @Column({ name: 'execution_order_id', type: 'uuid', nullable: true })
  executionOrderId: string | null;

  /** Contador de intentos de visita fallidos imputables al cliente (ADR-077 D6) */
  @Column({ name: 'retry_count', type: 'int', default: 0 })
  retryCount: number;

  /** Timestamp de cuando se pauso el SLA por ultima vez (ADR-077 D5). NULL = no pausado. */
  @Column({ name: 'sla_paused_at', type: 'timestamptz', nullable: true })
  slaPausedAt: Date | null;

  /** Motivo de la visita adicional cuando isAdditional=true (ADR-076 D3) */
  @Column({ name: 'additional_reason', type: 'text', nullable: true })
  additionalReason: string | null;

  /** Usuario que creo la solicitud */
  @Column({ name: 'requested_by_user_id', type: 'uuid' })
  requestedByUserId: string;

  /** Usuario que agendo la visita (cuando status = SCHEDULED) */
  @Column({ name: 'scheduled_by_user_id', type: 'uuid', nullable: true })
  scheduledByUserId: string | null;

  /** Timestamp de agendamiento (cuando status = SCHEDULED) */
  @Column({ name: 'scheduled_at', type: 'timestamptz', nullable: true })
  scheduledAt: Date | null;

  /** Timestamp de cancelacion (cuando status = CANCELLED) */
  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  /** Usuario que cancelo la solicitud */
  @Column({ name: 'cancelled_by_user_id', type: 'uuid', nullable: true })
  cancelledByUserId: string | null;

  /** Motivo de cancelacion */
  @Column({ name: 'cancel_reason', type: 'varchar', length: 200, nullable: true })
  cancelReason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
