import type { BillingStatementLedgerQuery } from '@iwana/shared';

/** Filtros del libro del estado de cuenta (spec MOD05↔MOD14 2026-11-13 D4). */
export const LEDGER_PERIODS = [
  { id: 'todo', label: 'Todo' },
  { id: '3m', label: '3 meses' },
  { id: '6m', label: '6 meses' },
  { id: '12m', label: 'Últimos 12 meses' },
  { id: 'rango', label: 'Rango de fechas' },
] as const;

export type LedgerPeriodId = (typeof LEDGER_PERIODS)[number]['id'];

/** `?periodo=` de la URL; vacío o desconocido es «Todo». */
export function ledgerPeriodId(value: string | null | undefined): LedgerPeriodId {
  return LEDGER_PERIODS.find((period) => period.id === value)?.id ?? 'todo';
}

const MONTHS: Partial<Record<LedgerPeriodId, number>> = { '3m': 3, '6m': 6, '12m': 12 };
const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/u;

/** Fecha civil local `YYYY-MM-DD` (el libro se filtra por fechas civiles, no por instantes). */
export function civilDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Mismo día `months` meses atrás; si ese mes es más corto, su último día. */
export function monthsBefore(today: Date, months: number): string {
  const year = today.getFullYear();
  const month = today.getMonth() - months;
  const lastDay = new Date(year, month + 1, 0).getDate();
  return civilDate(new Date(year, month, Math.min(today.getDate(), lastDay)));
}

export type LedgerPeriodResult =
  | { ok: true; query: BillingStatementLedgerQuery }
  | { ok: false; error: string };

/**
 * Traduce el filtro elegido a `from`/`to` del contrato. «Todo» no envía fechas; los periodos
 * móviles envían solo `from` (la API llega hasta hoy en la zona de la empresa).
 */
export function ledgerPeriodQuery(
  period: LedgerPeriodId,
  today: Date,
  range: { from: string; to: string } = { from: '', to: '' },
): LedgerPeriodResult {
  const months = MONTHS[period];
  if (months) return { ok: true, query: { from: monthsBefore(today, months) } };
  if (period !== 'rango') return { ok: true, query: {} };
  const from = CIVIL_DATE.test(range.from) ? range.from : '';
  const to = CIVIL_DATE.test(range.to) ? range.to : '';
  if (!from && !to) return { ok: false, error: 'Elige la fecha inicial, la final o ambas.' };
  if (from && to && from > to)
    return { ok: false, error: 'La fecha inicial no puede ser posterior a la final.' };
  return { ok: true, query: { ...(from ? { from } : {}), ...(to ? { to } : {}) } };
}
