/** Formatea la fecha civil en la zona del tenant; nunca usa el huso del servidor. */
export function getTenantLocalDate(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const year = values.get('year');
  const month = values.get('month');
  const day = values.get('day');
  if (!year || !month || !day)
    throw new RangeError('No se pudo resolver la fecha local del tenant.');
  return `${year}-${month}-${day}`;
}
