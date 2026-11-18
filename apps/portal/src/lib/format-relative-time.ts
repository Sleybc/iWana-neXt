/**
 * Tiempo relativo compartido del portal (spec MOD10 bandeja §3 E). Extraído de la pestaña
 * Soporte (`TicketListItem`) para que la ficha y la bandeja lean igual.
 */

/** Duración legible: «45 min», «3 h» (hasta 47 h), «2 días». Mínimo 1 min. */
export function formatElapsed(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} días`;
}

/** «Vence en 3 h» si el plazo no ha pasado; «Vencido hace 2 días» si ya pasó. */
export function formatDueRelative(deadline: number, now: number): string {
  return deadline >= now
    ? `Vence en ${formatElapsed(deadline - now)}`
    : `Vencido hace ${formatElapsed(now - deadline)}`;
}
