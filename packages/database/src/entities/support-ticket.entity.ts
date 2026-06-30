import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  TicketFieldDecision,
  SlaBreachStatus,
  TicketPriority,
  TicketRequesterType,
  TicketQueue,
  TicketSource,
  TicketStatus,
  TicketSubjectType,
  TicketType,
} from '@iwana/shared';

/**
 * Entidad SupportTicket — schema por tenant (dinamico via search_path).
 *
 * Representa un ticket de soporte (incidente, PQR, solicitud de servicio) del modulo
 * Service Assurance / Mesa de Ayuda (MOD10).
 *
 * Sin @Entity({ schema }) — PostgreSQL resuelve via SET LOCAL search_path (ADR-038, ADR-018).
 * FK logicas: sin FK referenciales cross-table ni cross-schema.
 * Sin PII del suscriptor — solo IDs de referencia logica.
 *
 * HLD-MOD10-SERVICE-ASSURANCE-v1.0 §4
 */
@Index('idx_support_tickets_tenant_status', ['tenantId', 'status'])
@Index('idx_support_tickets_tenant_assignee', ['tenantId', 'assignedUserId'], {
  where: '"assigned_user_id" IS NOT NULL',
})
@Index('idx_support_tickets_tenant_type', ['tenantId', 'type'])
@Index('idx_support_tickets_tenant_created', ['tenantId', 'createdAt'])
@Index('idx_support_tickets_tenant_requester', ['tenantId', 'requesterRefId'], {
  where: '"requester_ref_id" IS NOT NULL',
})
@Index('idx_support_tickets_tenant_subject_ref', ['tenantId', 'subjectRefId'], {
  where: '"subject_ref_id" IS NOT NULL',
})
@Entity({ name: 'support_tickets' })
export class SupportTicket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** FK logica a public.tenants.id — sin FK referencial cross-schema */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  /** Codigo unico por tenant: TK-YYYYMMDD-NNN */
  @Column({ name: 'ticket_number', type: 'varchar', length: 30 })
  ticketNumber: string;

  @Column({ type: 'enum', enum: TicketType })
  type: TicketType;

  @Column({ type: 'enum', enum: TicketStatus, default: TicketStatus.OPEN })
  status: TicketStatus;

  @Column({ type: 'enum', enum: TicketPriority, default: TicketPriority.NORMAL })
  priority: TicketPriority;

  @Column({ type: 'enum', enum: TicketSource, default: TicketSource.MANUAL })
  source: TicketSource;

  @Column({ type: 'varchar', length: 200 })
  subject: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Tipo de solicitante — sin PII */
  @Column({ name: 'requester_type', type: 'enum', enum: TicketRequesterType })
  requesterType: TicketRequesterType;

  /** ID lógico del solicitante — puede referenciar subscriber, user, contractor, etc. */
  @Column({ name: 'requester_ref_id', type: 'varchar', length: 160, nullable: true })
  requesterRefId: string | null;

  /** Tipo del objeto afectado — sin FK cross-module */
  @Column({ name: 'subject_type', type: 'enum', enum: TicketSubjectType, nullable: true })
  subjectType: TicketSubjectType | null;

  /** ID lógico del objeto afectado — servicio, nodo, contrato, área interna, etc. */
  @Column({ name: 'subject_ref_id', type: 'varchar', length: 160, nullable: true })
  subjectRefId: string | null;

  /** Usuario asignado — referencia logica a users.id */
  @Column({ name: 'assigned_user_id', type: 'uuid', nullable: true })
  assignedUserId: string | null;

  @Column({ name: 'queue_name', type: 'enum', enum: TicketQueue, nullable: true })
  queueName: TicketQueue | null;

  /** Referencia logica a la politica SLA aplicada */
  @Column({ name: 'sla_policy_id', type: 'uuid', nullable: true })
  slaPolicyId: string | null;

  @Column({ name: 'sla_first_response_at', type: 'timestamptz', nullable: true })
  slaFirstResponseAt: Date | null;

  @Column({ name: 'sla_resolve_by_at', type: 'timestamptz', nullable: true })
  slaResolveByAt: Date | null;

  @Column({ name: 'first_responded_at', type: 'timestamptz', nullable: true })
  firstRespondedAt: Date | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @Column({
    name: 'sla_breach_status',
    type: 'enum',
    enum: SlaBreachStatus,
    default: SlaBreachStatus.OK,
  })
  slaBreachStatus: SlaBreachStatus;

  @Column({
    name: 'field_decision',
    type: 'enum',
    enum: TicketFieldDecision,
    default: TicketFieldDecision.NOT_REQUIRED,
  })
  fieldDecision: TicketFieldDecision;

  /** Referencia logica a work_orders.id (WFM) — sin FK referencial */
  @Column({ name: 'work_order_id', type: 'uuid', nullable: true })
  workOrderId: string | null;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
