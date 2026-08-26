/** Formato numérico del módulo comercial (es-CO), con separadores de miles. */
export function formatGroupedNumber(value: number): string {
  return new Intl.NumberFormat('es-CO').format(value);
}

/** Tasa tributaria para listados: siempre 2 decimales (es-CO). */
export function formatTaxRatePercent(value: string | number): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) {
    return '—';
  }
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}
