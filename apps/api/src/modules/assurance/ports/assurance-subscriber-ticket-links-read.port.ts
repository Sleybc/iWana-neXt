/** Proyección mínima de tickets con solicitante suscriptor para herramientas de Assurance. */
export interface AssuranceSubscriberTicketLink {
  ticketId: string;
  requesterRefId: string | null;
}

export abstract class AssuranceSubscriberTicketLinksReadPort {
  abstract listSubscriberTicketLinks(
    tenantId: string,
    schemaName: string,
  ): Promise<AssuranceSubscriberTicketLink[]>;
}
