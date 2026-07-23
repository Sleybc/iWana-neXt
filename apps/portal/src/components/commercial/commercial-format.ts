/** Formato numérico del módulo comercial (es-CO). */
export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat('es-CO').format(value);
}
