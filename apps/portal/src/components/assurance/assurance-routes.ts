/** Rutas de la mesa de ayuda (spec MOD10 §3 K). */
export const ASSURANCE_PATH = '/dashboard/assurance';

/** Parámetro de la bandeja que abre el panel de un ticket (mismo patrón que `?executionOrderId=`). */
export const ASSURANCE_TICKET_QUERY_KEY = 'ticketId';

export function getAssuranceTicketPath(ticketId: string): string {
  return `${ASSURANCE_PATH}/tickets/${encodeURIComponent(ticketId)}`;
}
