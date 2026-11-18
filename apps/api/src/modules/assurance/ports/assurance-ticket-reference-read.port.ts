import type { QueryRunner } from 'typeorm';

/** Referencia mínima de un ticket para enlazarlo desde otro módulo: sin datos del cliente. */
export interface AssuranceTicketReference {
  id: string;
  number: string;
}

/**
 * Puerto de lectura de Assurance para enlazar un ticket por su id (MOD11 consola,
 * spec 2026-11-18 §4). Corre con el `qr` del llamante (su transacción y su
 * `search_path`); filtra por el tenant del contexto verificado.
 */
export abstract class AssuranceTicketReferenceReadPort {
  /** `null` si el id no es UUID o el ticket no existe en el tenant. */
  abstract findTicketReference(
    ticketId: string,
    qr: QueryRunner,
  ): Promise<AssuranceTicketReference | null>;
}
