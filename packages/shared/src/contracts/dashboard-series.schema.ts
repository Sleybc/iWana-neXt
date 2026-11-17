import { z } from 'zod';

/**
 * Piezas comunes de los contratos del inicio del portal (HLD-MOD02 v3.0 §3, N1–N3).
 * Fechas y meses son civiles, en la zona horaria del tenant; nunca instantes.
 */

/** Meses de la serie mensual de N1 y N2: el mes en curso y los 11 anteriores. */
export const DASHBOARD_SERIES_MONTHS = 12;

/** Fecha civil AAAA-MM-DD válida. */
export const dashboardCivilDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Fecha civil inválida.');

/** Mes civil AAAA-MM. */
export const dashboardMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u);

/** Conteo entero no negativo. */
export const dashboardCountSchema = z.number().int().nonnegative();

/** Mes civil anterior a `month` (AAAA-MM). */
export function previousDashboardMonth(month: string): string {
  const [year, value] = month.split('-').map(Number) as [number, number];
  return value === 1 ? `${year - 1}-12` : `${year}-${String(value - 1).padStart(2, '0')}`;
}

/** Día civil anterior a `date` (AAAA-MM-DD). */
export function previousDashboardDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() - 1);
  return parsed.toISOString().slice(0, 10);
}

/**
 * Valida que `keys` sea una serie ascendente, sin huecos ni repetidos, que termina en `last`.
 * `previous` da la clave anterior (mes o día).
 */
export function isContiguousSeriesEndingAt(
  keys: readonly string[],
  last: string,
  previous: (key: string) => string,
): boolean {
  let expected = last;
  for (let index = keys.length - 1; index >= 0; index -= 1) {
    if (keys[index] !== expected) return false;
    expected = previous(expected);
  }
  return true;
}
