import type { AssuranceTicketReference } from './assurance-ticket-reference-read.port';

/** Tope de tickets por suscriptor que devuelve el puerto (la franja de visitas no pagina). */
export const ASSURANCE_SUBSCRIBER_TICKETS_READ_LIMIT = 200;

/**
 * Puerto de lectura de Assurance: tickets de un suscriptor, con la misma regla de vínculo
 * que el listado de tickets por suscriptor (solicitante suscriptor, asunto suscriptor o
 * asunto un contrato suyo). Lo consume WFM para la franja «Próximas visitas» (spec
 * 2026-11-20 v1.1, H13): la solicitud creada desde un ticket no guarda el suscriptor.
 * Abre su propia transacción en el schema del tenant; solo devuelve id y número.
 */
export abstract class AssuranceSubscriberTicketsReadPort {
  abstract listSubscriberTicketRefs(
    tenantId: string,
    schemaName: string,
    subscriberId: string,
  ): Promise<AssuranceTicketReference[]>;
}
