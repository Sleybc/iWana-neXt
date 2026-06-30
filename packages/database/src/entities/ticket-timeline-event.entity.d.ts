import { TicketTimelineEventType } from '@iwana/shared';
/**
 * Entidad TicketTimelineEvent — schema por tenant (dinamico via search_path).
 *
 * Registro append-only de eventos del ciclo de vida de un ticket.
 * Sin soft-delete, sin UpdateDateColumn — la timeline es inmutable.
 *
 * HLD-MOD10-SERVICE-ASSURANCE-v1.0 §4
 */
export declare class TicketTimelineEvent {
    id: string;
    /** FK logica a support_tickets.id — sin FK referencial */
    ticketId: string;
    tenantId: string;
    eventType: TicketTimelineEventType;
    /** Datos adicionales del evento — estructura libre segun eventType */
    payload: Record<string, unknown>;
    /** Usuario que origino el evento — null si fue automatico */
    actorUserId: string | null;
    occurredAt: Date;
}
//# sourceMappingURL=ticket-timeline-event.entity.d.ts.map