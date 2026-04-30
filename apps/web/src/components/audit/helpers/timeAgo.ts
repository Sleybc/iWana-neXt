/** Retorna tiempo relativo legible en español desde una fecha ISO */
export function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `hace ${minutes} min`;
  if (hours < 24) return `hace ${hours} h`;
  if (days === 1) return 'ayer';
  if (days < 30) return `hace ${days} días`;
  return new Date(isoDate).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
}
