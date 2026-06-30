/**
 * Entidad TicketComment — schema por tenant (dinamico via search_path).
 *
 * Comentarios internos y externos de un ticket de soporte.
 * Entidad append-only: sin soft-delete ni UpdateDateColumn.
 *
 * HLD-MOD10-SERVICE-ASSURANCE-v1.0 §4
 */
export declare class TicketComment {
    id: string;
    /** FK logica a support_tickets.id — sin FK referencial */
    ticketId: string;
    tenantId: string;
    body: string;
    /** Comentario interno: no visible al solicitante externo */
    isInternal: boolean;
    /** Autor del comentario — referencia logica a users.id */
    authorUserId: string;
    createdAt: Date;
}
//# sourceMappingURL=ticket-comment.entity.d.ts.map