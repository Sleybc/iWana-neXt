/**
 * Aritmética decimal exacta en céntimos para importes y cantidades de Compras
 * (cadenas decimales de las columnas `numeric(x, 2)` del API).
 *
 * Ninguna operación pasa importes por `parseFloat` + suma: la acumulación
 * flotante introduce deriva binaria (0.1 + 0.2 ≠ 0.3) y hace que dos vistas
 * de la misma selección (matriz, acordeón, barra de resumen) calculen totales
 * distintos. La única representación intermedia son céntimos enteros.
 *
 * Único dueño de esta aritmética en el portal: `award-matrix.ts`,
 * `AwardMatrixTable` y `AwardQuoteAccordion` consumen estas funciones en
 * lugar de reimplementarlas.
 */

/**
 * Convierte una cadena decimal a céntimos enteros de forma EXACTA: parsea la
 * parte entera y la fraccional por separado y NUNCA pasa el total por
 * `parseFloat`. Devuelve `null` cuando la cadena no es un decimal simple
 * (vacía, sin dígitos o con otro formato): el llamador decide si eso es «0»
 * (cantidades) o «no compite» (comparación de costos).
 *
 * - Acepta signo «-»/«+». Los importes del dominio nunca son negativos, pero
 *   el signo se soporta con negación entera para no ocultar datos erróneos
 *   aguas arriba.
 * - Con más de 2 decimales (fuera del dominio `numeric(x, 2)`), la cola se
 *   redondea half-up al céntimo comparando la cola como cadena, también sin
 *   flotantes.
 */
export function parseDecimalCents(value: string): number | null {
  const match = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(value.trim());
  if (!match || (!match[2] && !match[3])) {
    return null;
  }
  const sign = match[1] === '-' ? -1 : 1;
  // Dígitos puros: la conversión a número es exacta dentro del rango entero
  // seguro (magnitudes acotadas por las columnas numeric(precision, 2) de la BD).
  let cents = Number(match[2] || '0') * 100 + Number((match[3] ?? '').slice(0, 2).padEnd(2, '0'));
  // Cola decimal (>2 dígitos) redondeada half-up sin flotantes: 0.125 → 13¢.
  const tail = (match[3] ?? '').slice(2);
  if (tail.length > 0 && Number(tail) >= Number('5'.padEnd(tail.length, '0'))) {
    cents += 1;
  }
  return sign * cents;
}

/**
 * Variante tolerante de `parseDecimalCents`: lo que no es decimal simple
 * cuenta como 0 (misma tolerancia que `parseQuantity` de `award-matrix.ts`).
 */
export function decimalStringToCents(value: string): number {
  return parseDecimalCents(value) ?? 0;
}

/**
 * Formatea céntimos → cadena decimal de 2 posiciones con ceros a la izquierda
 * en la fraccional, EXACTO por construcción (enteros, sin `toFixed` sobre
 * flotantes): 42851 → '428.51', 5 → '0.05', 0 → '0.00'. El signo negativo no
 * ocurre en el dominio; si aparece, se respeta fielmente ('-1.50').
 */
export function formatCentsAsDecimal2(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const absCents = Math.abs(cents);
  const whole = Math.trunc(absCents / 100);
  const remainder = absCents % 100;
  return `${sign}${whole}.${String(remainder).padStart(2, '0')}`;
}
