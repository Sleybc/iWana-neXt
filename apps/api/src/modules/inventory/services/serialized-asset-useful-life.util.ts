import {
  SerializedAssetUsefulLife,
  UsefulLifeStatus,
} from '../types/serialized-asset-detail.types';

/** Umbral de «por vencer» en meses — fuente única para cálculo TS y predicado SQL (D-H6-5). */
export const USEFUL_LIFE_ALERT_THRESHOLD_MONTHS = 3;

interface UsefulLifeInput {
  usefulLifeMonths: number | null;
  purchaseDate: string | null;
  warrantyUntil: string | null;
  referenceDate?: Date;
}

function toUtcDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function parseUtcDateOnly(isoDate: string): Date {
  const segments = isoDate.split('-');
  const year = Number(segments[0]);
  const month = Number(segments[1] ?? '1');
  const day = Number(segments[2] ?? '1');
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Suma meses a una fecha UTC date-only con el mismo clamp que PostgreSQL
 * (`date + n * INTERVAL '1 month'`).
 */
function addMonthsUtc(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const originalDay = result.getUTCDate();
  result.setUTCMonth(result.getUTCMonth() + months);
  if (result.getUTCDate() < originalDay) {
    result.setUTCDate(0);
  }
  return result;
}

/**
 * Meses de calendario con sensibilidad al día (UTC).
 * Si el día de `to` aún no alcanzó el de `from`, no cuenta el mes en curso.
 */
function signedCalendarMonthsBetween(from: Date, to: Date): number {
  let months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() < from.getUTCDate()) {
    months -= 1;
  }
  return months;
}

/**
 * Clasificación día-exacta alineada al predicado SQL:
 * - vencida: expiry <= referenceDate
 * - por-vencer: referenceDate < expiry <= referenceDate + 3 months
 * - vigente: expiry > referenceDate + 3 months
 */
function resolveUsefulLifeStatusFromExpiry(
  expiry: Date,
  referenceDate: Date,
): Exclude<UsefulLifeStatus, 'sin-dato'> {
  if (expiry.getTime() <= referenceDate.getTime()) {
    return 'vencida';
  }
  const thresholdEnd = addMonthsUtc(referenceDate, USEFUL_LIFE_ALERT_THRESHOLD_MONTHS);
  if (expiry.getTime() <= thresholdEnd.getTime()) {
    return 'por-vencer';
  }
  return 'vigente';
}

/**
 * Fecha de vencimiento alineada al predicado SQL:
 * `purchase_date + useful_life_months * INTERVAL '1 month'` (comportamiento date de PostgreSQL).
 */
export function usefulLifeExpiryDate(purchaseDate: string, usefulLifeMonths: number): Date {
  return addMonthsUtc(parseUtcDateOnly(purchaseDate), usefulLifeMonths);
}

/**
 * Calcula vida útil con semántica día-exacta (D-H6-5).
 * Status y monthsRemaining se derivan de `usefulLifeExpiryDate` vs referenceDate UTC date-only,
 * no de un `monthsBetween` que ignore el día.
 */
export function calculateUsefulLife(input: UsefulLifeInput): SerializedAssetUsefulLife {
  const { usefulLifeMonths, purchaseDate, warrantyUntil } = input;
  const referenceDate = toUtcDateOnly(input.referenceDate ?? new Date());

  if (!usefulLifeMonths || !purchaseDate) {
    return {
      monthsTotal: usefulLifeMonths,
      monthsElapsed: null,
      monthsRemaining: null,
      warrantyUntil,
      status: 'sin-dato',
    };
  }

  const purchase = parseUtcDateOnly(purchaseDate);
  const expiry = usefulLifeExpiryDate(purchaseDate, usefulLifeMonths);
  const monthsElapsed = Math.max(0, signedCalendarMonthsBetween(purchase, referenceDate));
  const monthsRemaining = signedCalendarMonthsBetween(referenceDate, expiry);
  const status = resolveUsefulLifeStatusFromExpiry(expiry, referenceDate);

  return {
    monthsTotal: usefulLifeMonths,
    monthsElapsed,
    monthsRemaining,
    warrantyUntil,
    status,
  };
}
