/**
 * Payload del job `request-field-service` (cola `assurance-field-service`).
 *
 * Solo ids (sec-eng C-1, 2026-11-22): un fallido queda en Redis hasta 14 días, fuera del
 * alcance de la supresión de Privacy, así que el asunto y las notas del ticket (texto libre,
 * posible dato personal) no viajan. El worker los lee del schema tenant dentro de su
 * transacción.
 */
export interface FieldServiceRequest {
  ticketId: string;
  /**
   * Id de la solicitud (`ticket_work_order_links.id`) cuyas notas toma el worker.
   * Opcional: los jobs encolados antes no lo traen y el worker usa la solicitud más reciente.
   */
  linkId?: string;
  tenantId: string;
  schemaName: string;
  requestedByUserId: string;
}
