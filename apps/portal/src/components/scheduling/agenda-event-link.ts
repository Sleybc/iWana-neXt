/**
 * Enlace a un evento de la agenda (spec MOD09 agenda §3 G, CA-9/CA-10). El parámetro
 * `eventId` abre el panel del evento sobre su día; no choca con el estado de la agenda
 * (`view`, `fromDate`, filtros) ni con los enlaces entrantes (`open`, `type`, `expedienteId`).
 */

export const AGENDA_PATH = '/dashboard/scheduling/agenda';
export const AGENDA_EVENT_PARAM = 'eventId';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function isAgendaEventId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/** Ruta al evento; con `dayKey` (AAAA-MM-DD) la agenda carga ese día desde el primer render. */
export function buildAgendaEventHref(eventId: string, dayKey?: string | null): string {
  const params = new URLSearchParams();
  if (dayKey) {
    params.set('view', 'day');
    params.set('fromDate', dayKey);
  }
  params.set(AGENDA_EVENT_PARAM, eventId);
  return `${AGENDA_PATH}?${params.toString()}`;
}

/** Quita el parámetro del evento y conserva el resto de la dirección. */
export function removeAgendaEventParam(current: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(current);
  next.delete(AGENDA_EVENT_PARAM);
  return next;
}
