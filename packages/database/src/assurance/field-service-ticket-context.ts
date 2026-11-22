import type { QueryRunner } from 'typeorm';

/** Lo que la solicitud de visita necesita del ticket y de su solicitud de trabajo de campo. */
export interface FieldServiceTicketContext {
  ticketNumber: string | null;
  subject: string;
  priority: string;
  notes: string | null;
}

/**
 * Contexto del ticket para el job `request-field-service` (sec-eng C-1, 2026-11-22).
 *
 * Dueño: Assurance. Vive en `@iwana/db` porque el worker no puede importar `apps/api` y no lee
 * tablas de otro módulo por su cuenta (ADR-076 D6, mismo patrón que `countUsageSubscribers`
 * de CRM, ADR-114 §7). El job solo lleva ids; el asunto y las notas (texto libre) se leen aquí.
 *
 * Toma el ticket `FOR SHARE`: el API lo tiene bloqueado (`pessimistic_write`) mientras crea la
 * solicitud y encola, así que esta lectura espera a su commit y la solicitud ya es visible. El
 * tope de espera evita retener una conexión si esa transacción quedara abierta.
 *
 * Devuelve `null` si no hay ticket o solicitud (la transacción del API se revirtió). Sin
 * `linkId` (jobs encolados antes de C-1) usa la solicitud más reciente del ticket.
 * El llamador fija `search_path` con `runInTenantSchema`.
 */
export async function readFieldServiceTicketContext(
  qr: QueryRunner,
  ref: { tenantId: string; ticketId: string; linkId?: string },
): Promise<FieldServiceTicketContext | null> {
  await qr.query(`SET LOCAL lock_timeout = '10s'`);
  const [ticket] = (await qr.query(
    `SELECT ticket_number, subject, priority::text AS priority
       FROM support_tickets
      WHERE id = $1 AND tenant_id = $2
        FOR SHARE`,
    [ref.ticketId, ref.tenantId],
  )) as Array<{ ticket_number: string | null; subject: string; priority: string }>;
  if (!ticket) return null;

  const [link] = (await (ref.linkId
    ? qr.query(
        `SELECT notes FROM ticket_work_order_links
          WHERE id = $1 AND ticket_id = $2 AND tenant_id = $3`,
        [ref.linkId, ref.ticketId, ref.tenantId],
      )
    : qr.query(
        `SELECT notes FROM ticket_work_order_links
          WHERE ticket_id = $1 AND tenant_id = $2
          ORDER BY requested_at DESC LIMIT 1`,
        [ref.ticketId, ref.tenantId],
      ))) as Array<{ notes: string | null }>;
  if (!link) return null;

  return {
    ticketNumber: ticket.ticket_number,
    subject: ticket.subject,
    priority: ticket.priority,
    notes: link.notes,
  };
}
