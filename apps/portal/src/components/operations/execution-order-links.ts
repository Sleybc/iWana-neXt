import type { ExecutionOrderDetailResponse } from '@/lib/api-client';
import { getAssuranceTicketPath } from '@/components/assurance/assurance-routes';
import { isUuid } from '@/components/assurance/assurance-ticket-links';
import { buildAgendaEventHref } from '@/components/scheduling/agenda-event-link';

/**
 * Enlaces de la cabecera de la consola (spec 2026-11-18 §3 G–H, contrato
 * `ExecutionOrderDetail` v1.8). La regla de nulo la aplica el servidor: cada
 * enlace existe solo si su campo llega. Como en el detalle del ticket (MOD10),
 * los identificadores se validan como UUID antes de construir la ruta: un valor
 * inesperado no enlaza.
 */

export function executionOrderSubscriberHref(
  subscriber: ExecutionOrderDetailResponse['subscriber'],
): string | null {
  if (!subscriber || !isUuid(subscriber.id)) return null;
  return `/dashboard/crm/subscribers/${encodeURIComponent(subscriber.id)}`;
}

export function executionOrderSourceTicketHref(
  sourceTicket: ExecutionOrderDetailResponse['sourceTicket'],
): string | null {
  if (!sourceTicket || !isUuid(sourceTicket.id)) return null;
  return getAssuranceTicketPath(sourceTicket.id);
}

function localDate(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Visita en Programación (spec MOD09 agenda §3 G, CA-10): un clic abre el panel del
 * evento sobre su día (`eventId`); sin ventana, el evento sin día fijo (la agenda lo
 * ubica). Sin evento no hay enlace.
 */
export function executionOrderVisitHref(
  visit: ExecutionOrderDetailResponse['visit'],
  windowStartAt: string | null | undefined,
): string | null {
  if (!visit || !isUuid(visit.scheduleEventId)) return null;
  const day = windowStartAt ? localDate(windowStartAt) : null;
  return buildAgendaEventHref(visit.scheduleEventId, day);
}
