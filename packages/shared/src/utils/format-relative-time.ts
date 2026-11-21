/**
 * Tiempo relativo compartido (U-6, contrato `formatRelativeTime` v1.0).
 * Tramos: minutos (<60), horas (<24) y días. Fecha nula o inválida → «Reciente»;
 * fecha futura → «ahora». Por debajo de un minuto también devuelve «ahora».
 */
const RELATIVE_TIME_FORMAT = new Intl.RelativeTimeFormat('es-CO', { numeric: 'auto' });

const MINUTE_MS = 60_000;

export function formatRelativeTime(
  value: string | Date | null | undefined,
  now: Date = new Date(Date.now()),
): string {
  if (value === null || value === undefined) return 'Reciente';
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  if (Number.isNaN(time)) return 'Reciente';

  const minutes = Math.floor((now.getTime() - time) / MINUTE_MS);
  if (minutes < 1) return RELATIVE_TIME_FORMAT.format(0, 'second');
  if (minutes < 60) return RELATIVE_TIME_FORMAT.format(-minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return RELATIVE_TIME_FORMAT.format(-hours, 'hour');
  return RELATIVE_TIME_FORMAT.format(-Math.floor(hours / 24), 'day');
}
