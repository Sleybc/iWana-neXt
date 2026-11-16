import type { MigrationEntity } from '@iwana/shared';
import type { ImportedTicketComment } from '../ports/migration-import.ports';
import { ticketCommentEntries } from './uisp-promotion-mapping';
import { uispUserNumber as stagedUserNumber } from './uisp-staged-user-refs';

/**
 * Atribución de tickets, comentarios y pagos importados al personal de iWana por la
 * equivalencia `USUARIO` (ADR-110 D15; spec «usuarios» §2.6). Pura: `resolve` traduce el
 * número de UISP al usuario vigente de iWana o devuelve `null` (sin equivalencia o usuario
 * borrado), y en ese caso el puerto deja la fila a nombre de quien importa.
 */
type Raw = Record<string, unknown> | null | undefined;
export type UispUserResolver = (uispUserId: string) => string | null;

/**
 * Número de usuario de UISP canónico (texto, como `external_value` de la equivalencia) o
 * `null`. Misma regla que las filas de revisión (entero positivo que cabe en `integer`).
 */
export function uispUserNumber(value: unknown): string | null {
  const number = stagedUserNumber(value);
  return number === null ? null : String(number);
}

export interface TicketAttribution {
  assignedUserId: string | null;
  /** Autor del primer comentario (en el orden de UISP) si tiene equivalencia. */
  createdByUserId: string | null;
  comments: Array<ImportedTicketComment & { authorUserId: string | null }>;
}

/**
 * Asignado (`assignedUserId`), autor de cada comentario (`activity[].userId`) y creador del
 * ticket. El creador es el autor del **primer** comentario: si ese no tiene equivalencia, el
 * ticket queda a nombre de quien importa (no se toma el autor de un comentario posterior, que
 * no abrió el ticket).
 */
export function ticketAttribution(raw: Raw, resolve: UispUserResolver): TicketAttribution {
  const lookup = (value: unknown) => {
    const number = uispUserNumber(value);
    return number === null ? null : resolve(number);
  };
  const comments = ticketCommentEntries(raw).map(({ comment, userId }) => ({
    ...comment,
    authorUserId: lookup(userId),
  }));
  return {
    assignedUserId: lookup(raw?.['assignedUserId']),
    createdByUserId: comments[0]?.authorUserId ?? null,
    comments,
  };
}

export function paymentAttribution(
  raw: Raw,
  resolve: UispUserResolver,
): { createdBy: string | null } {
  const number = uispUserNumber(raw?.['userId']);
  return { createdBy: number === null ? null : resolve(number) };
}

/** Números de UISP de un registro que atribuyen algo al importarlo (sin repetir). */
export function referencedUserNumbers(entity: MigrationEntity, raw: Raw): string[] {
  const numbers = new Set<string>();
  const add = (value: unknown) => {
    const number = uispUserNumber(value);
    if (number !== null) numbers.add(number);
  };
  if (entity === 'TICKET') {
    add(raw?.['assignedUserId']);
    for (const entry of ticketCommentEntries(raw)) add(entry.userId);
  } else if (entity === 'PAGO') {
    add(raw?.['userId']);
  }
  return [...numbers];
}
