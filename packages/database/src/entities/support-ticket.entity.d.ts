import { TicketFieldDecision, SlaBreachStatus, TicketPriority, TicketRequesterType, TicketQueue, TicketSource, TicketStatus, TicketSubjectType, TicketType } from '@iwana/shared';
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
export declare class SupportTicket {
    id: string;
    /** FK logica a public.tenants.id — sin FK referencial cross-schema */
    tenantId: string;
    /** Codigo unico por tenant: TK-YYYYMMDD-NNN */
    ticketNumber: string;
    type: TicketType;
    status: TicketStatus;
    priority: TicketPriority;
    source: TicketSource;
    subject: string;
    description: string | null;
    /** Tipo de solicitante — sin PII */
    requesterType: TicketRequesterType;
    /** ID lógico del solicitante — puede referenciar subscriber, user, contractor, etc. */
    requesterRefId: string | null;
    /** Tipo del objeto afectado — sin FK cross-module */
    subjectType: TicketSubjectType | null;
    /** ID lógico del objeto afectado — servicio, nodo, contrato, área interna, etc. */
    subjectRefId: string | null;
    /** Usuario asignado — referencia logica a users.id */
    assignedUserId: string | null;
    queueName: TicketQueue | null;
    /** Referencia logica a la politica SLA aplicada */
    slaPolicyId: string | null;
    slaFirstResponseAt: Date | null;
    slaResolveByAt: Date | null;
    firstRespondedAt: Date | null;
    resolvedAt: Date | null;
    closedAt: Date | null;
    slaBreachStatus: SlaBreachStatus;
    fieldDecision: TicketFieldDecision;
    /** Referencia logica a work_orders.id (WFM) — sin FK referencial */
    workOrderId: string | null;
    createdByUserId: string;
    createdAt: Date;
    updatedAt: Date;
}
//# sourceMappingURL=support-ticket.entity.d.ts.map