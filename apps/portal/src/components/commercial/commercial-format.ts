/** Formato numérico del módulo comercial (es-CO), con separadores de miles. */
export function formatGroupedNumber(value: number): string {
  return new Intl.NumberFormat('es-CO').format(value);
}
