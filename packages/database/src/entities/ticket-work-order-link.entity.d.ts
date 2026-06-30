/**
 * Entidad TicketWorkOrderLink — schema por tenant (dinamico via search_path).
 *
 * Registro del vinculo entre un ticket de soporte y una Work Order de WFM.
 * Referencia logica — sin FK referencial cross-module.
 * Entidad append-only: la solicitud de campo queda trazada permanentemente.
 *
 * HLD-MOD10-SERVICE-ASSURANCE-v1.0 §4
 */
export declare class TicketWorkOrderLink {
    id: string;
    /** FK logica a support_tickets.id — sin FK referencial */
    ticketId: string;
    tenantId: string;
    /** Referencia logica a work_orders.id (WFM) — sin FK referencial cross-module */
    workOrderId: string | null;
    requestedAt: Date;
    requestedByUserId: string;
    notes: string | null;
    createdAt: Date;
}
//# sourceMappingURL=ticket-work-order-link.entity.d.ts.map