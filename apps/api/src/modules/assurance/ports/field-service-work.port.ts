import type { EntityManager } from 'typeorm';

/**
 * Puerto de cancelación de trabajo de campo hacia WFM (MOD09).
 *
 * MOD10 (Assurance) usa este puerto para cancelar una visita activa cuando
 * el ticket se resuelve o cierra por canal remoto sin que fuera necesaria
 * la visita de campo (V8 / F4.2).
 *
 * MOD10 conoce la interfaz; MOD09 implementa el adapter. Esto respeta
 * el boundary del Modulith (ADR-037, ADR-038).
 */

export interface CancelActiveForTicketResult {
  /** true si se encontró y canceló una visita activa. false si no había visita que cancelar. */
  cancelled: boolean;
  /** ID de la visita cancelada, o null si no se encontró */
  visitRequestId: string | null;
}

export abstract class FieldServiceWorkPort {
  /**
   * Cancela la visita activa asociada a un ticket si existe.
   *
   * @param manager — EntityManager de la transacción activa (lease de MOD10)
   * @param tenantId — ID del tenant
   * @param ticketId — ID del ticket que se está cerrando/resolviendo
   * @param reason — motivo de la cancelación (ej: "Ticket resuelto por canal remoto")
   * @param actorUserId — ID del usuario que ejecuta la acción
   */
  abstract cancelActiveForTicket(
    manager: EntityManager,
    tenantId: string,
    ticketId: string,
    reason: string,
    actorUserId: string,
  ): Promise<CancelActiveForTicketResult>;
}
