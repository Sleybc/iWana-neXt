import { computeCutoffDate } from './billing-cutoff';
import type {
  BillingCutoffMode,
  BillingPeriodPaymentState,
  BillingPeriodTiming,
  BillingProrationMethod,
} from '../contracts/billing/billing-constants';
import type { BillingPolicyPreviewItem } from '../contracts/billing/billing-policy.contract';

/**
 * Módulo único de funciones puras de fechas y calendario de facturación (ADR-103 D5, HLD v1.1 §4).
 * Reutiliza computeCutoffDate de billing-cutoff.ts sin cambiar su firma ni comportamiento.
 * Todas las operaciones operan sobre fechas civiles YYYY-MM-DD de forma puramente determinista.
 */

export interface BillingPeriodSpan {
  periodStart: string;
  periodEnd: string;
}

export interface BillingDueAndCutoff {
  dueDate: string;
  cutoffDate: string | null;
}

export interface BillingDueAndCutoffPolicyInput {
  cutoffMode: BillingCutoffMode;
  paymentTermDays: number;
  graceDays: number;
  cutoffEnabled?: boolean;
}

export interface BillingPreviewInput {
  cycleDay: number;
  cutoffDay?: number | null;
  policy: {
    periodTiming: BillingPeriodTiming;
    generationLeadDays: number;
    cutoffMode: BillingCutoffMode;
    paymentTermDays: number;
    graceDays: number;
    cutoffEnabled?: boolean;
  };
  today: string;
}

/** Ventana de candidatos CRM suficiente para encontrar el último periodo generable. */
export const BILLING_TERMINATED_LOOKBACK_DAYS = 62;

function parseCivilDate(value: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) throw new RangeError(`La fecha "${value}" no tiene formato YYYY-MM-DD.`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const maxDay = daysInMonth(year, month);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > maxDay) {
    throw new RangeError(`La fecha "${value}" no es una fecha civil válida.`);
  }
  return { year, month, day };
}

function formatCivilDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function addDays(civilDate: string, days: number): string {
  const { year, month, day } = parseCivilDate(civilDate);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return formatCivilDate(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
}

export function diffInDays(startDate: string, endDate: string): number {
  const d1 = parseCivilDate(startDate);
  const d2 = parseCivilDate(endDate);
  const ms1 = Date.UTC(d1.year, d1.month - 1, d1.day);
  const ms2 = Date.UTC(d2.year, d2.month - 1, d2.day);
  return Math.round((ms2 - ms1) / 86_400_000);
}

/** Redondeo simétrico hacia centavos (D-BIL-8). */
export function roundHalfUpToCents(amount: number): number {
  const factor = 100;
  return Math.round((amount + Number.EPSILON) * factor) / factor;
}

/**
 * Calcula el periodo M del contrato: desde el día `cycleDay` de M
 * hasta el día anterior al día `cycleDay` de M+1 (ADR-103 D5).
 */
export function computeBillingPeriod(
  cycleDay: number,
  year: number,
  month: number,
): BillingPeriodSpan {
  if (!Number.isInteger(cycleDay) || cycleDay < 1 || cycleDay > 28) {
    throw new RangeError('El día de facturación debe estar entre 1 y 28.');
  }
  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    throw new RangeError('El año debe estar entre 1 y 9999.');
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError('El mes debe estar entre 1 y 12.');
  }

  const periodStart = formatCivilDate(year, month, cycleDay);

  let nextYear = year;
  let nextMonth = month + 1;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }

  let periodEnd: string;
  if (cycleDay === 1) {
    // Si cycleDay es 1, el día anterior al día 1 del mes siguiente es el último día del mes actual
    const lastDay = daysInMonth(year, month);
    periodEnd = formatCivilDate(year, month, lastDay);
  } else {
    // Si cycleDay es > 1, el día anterior en el mes siguiente es cycleDay - 1
    periodEnd = formatCivilDate(nextYear, nextMonth, cycleDay - 1);
  }

  return { periodStart, periodEnd };
}

/**
 * Calcula la fecha de generación de un periodo (ADR-103 D5).
 * - ANTICIPADO: inicio del periodo menos generationLeadDays.
 * - VENCIDO: inicio del periodo siguiente menos generationLeadDays.
 */
export function computeGenerationDate(
  period: BillingPeriodSpan,
  timing: BillingPeriodTiming,
  leadDays: number,
): string {
  if (leadDays < 0 || leadDays > 15) {
    throw new RangeError('Los días de anticipación deben estar entre 0 y 15.');
  }

  if (timing === 'ANTICIPADO') {
    return addDays(period.periodStart, -leadDays);
  }

  // VENCIDO: el inicio del periodo siguiente es el día inmediatamente posterior a periodEnd
  const nextPeriodStart = addDays(period.periodEnd, 1);
  return addDays(nextPeriodStart, -leadDays);
}

/**
 * Resuelve el periodo más reciente cuya generación ya llegó (HLD §4, RS-11).
 * Se evalúa también el mes siguiente, porque ANTICIPADO puede generarlo dentro
 * del mes local. Los dos meses anteriores cubren VENCIDO en meses de 31 días.
 */
export function resolveGenerationTarget(
  cycleDay: number,
  policy: Pick<BillingPreviewInput['policy'], 'periodTiming' | 'generationLeadDays'>,
  localDate: string,
): BillingPeriodSpan {
  const { year, month } = parseCivilDate(localDate);
  const today = formatCivilDate(year, month, Number(localDate.slice(8, 10)));
  let target: BillingPeriodSpan | null = null;

  for (let monthOffset = -1; monthOffset <= 2; monthOffset += 1) {
    const absoluteMonth = year * 12 + month - 1 - monthOffset;
    const periodYear = Math.floor(absoluteMonth / 12);
    const periodMonth = (absoluteMonth % 12) + 1;
    if (periodYear < 1 || periodYear > 9999) continue;
    const period = computeBillingPeriod(cycleDay, periodYear, periodMonth);
    const generationDate = computeGenerationDate(
      period,
      policy.periodTiming,
      policy.generationLeadDays,
    );
    if (generationDate <= today && (!target || period.periodStart > target.periodStart)) {
      target = period;
    }
  }

  if (!target) throw new RangeError('No se encontró un periodo de facturación generable.');
  return target;
}

/**
 * Calcula el vencimiento y corte del periodo según el modo de política (ADR-103 D5, PRD §6).
 * - DIA_FIJO_CICLO:
 *     Corte = computeCutoffDate(...) del catálogo (ADR-102 D5)
 *     Vencimiento = día anterior al corte (D-BIL-3)
 * - VENCIMIENTO_MAS_GRACIA:
 *     Vencimiento = issueDate + paymentTermDays
 *     Corte = vencimiento + máx(1, graceDays)
 */
export function computeDueAndCutoff(
  period: BillingPeriodSpan,
  policy: BillingDueAndCutoffPolicyInput,
  issueDate: string,
  cutoffDay?: number | null,
): BillingDueAndCutoff {
  const cutoffEnabled = policy.cutoffEnabled ?? true;

  if (policy.cutoffMode === 'DIA_FIJO_CICLO') {
    if (cutoffDay == null) {
      throw new RangeError('El modo DIA_FIJO_CICLO requiere cutoffDay definido en el catálogo.');
    }
    const startParsed = parseCivilDate(period.periodStart);
    const rawCutoff = computeCutoffDate({
      cycleDay: startParsed.day,
      cutoffDay,
      year: startParsed.year,
      month: startParsed.month,
    });

    const dueDate = addDays(rawCutoff, -1);
    const cutoffDate = cutoffEnabled ? rawCutoff : null;
    return { dueDate, cutoffDate };
  }

  // VENCIMIENTO_MAS_GRACIA
  const termDays = policy.paymentTermDays;
  const dueDate = addDays(issueDate, termDays);
  const grace = Math.max(1, policy.graceDays);
  const cutoffDate = cutoffEnabled ? addDays(dueDate, grace) : null;

  return { dueDate, cutoffDate };
}

/**
 * Periodo cobrado tarde (spec 2026-11-11 R8): si el vencimiento del ciclo es anterior a la fecha
 * de referencia (generación o emisión), vence en esa fecha + `paymentTermDays` y el corte se
 * corre los mismos días. Un documento nunca nace vencido. Sin cambio si vence en la fecha o después.
 */
export function shiftLateDueAndCutoff(
  dates: BillingDueAndCutoff,
  referenceDate: string,
  paymentTermDays: number,
): BillingDueAndCutoff {
  if (dates.dueDate >= referenceDate) return dates;
  if (!Number.isInteger(paymentTermDays) || paymentTermDays < 0) {
    throw new RangeError('El plazo de pago debe ser un entero no negativo.');
  }
  const dueDate = addDays(referenceDate, paymentTermDays);
  const shift = diffInDays(dates.dueDate, dueDate);
  return {
    dueDate,
    cutoffDate: dates.cutoffDate == null ? null : addDays(dates.cutoffDate, shift),
  };
}

/**
 * Calcula el prorrateo de un valor para un periodo incompleto (ADR-103 D5).
 * - DIAS_REALES: price * coveredDays / periodDays
 * - MES_30: price * coveredDays / 30
 */
export function prorate(
  price: number | string,
  coveredDays: number,
  periodDays: number,
  method: BillingProrationMethod = 'DIAS_REALES',
): number {
  const numericPrice = typeof price === 'string' ? Number.parseFloat(price) : price;
  if (!Number.isFinite(numericPrice) || numericPrice < 0) {
    throw new RangeError('El precio base para prorrateo debe ser un número no negativo.');
  }
  if (coveredDays <= 0) return 0;

  if (method === 'MES_30') {
    return roundHalfUpToCents((numericPrice * coveredDays) / 30);
  }

  if (periodDays <= 0) {
    throw new RangeError('Los días del periodo deben ser mayores a cero.');
  }
  return roundHalfUpToCents((numericPrice * coveredDays) / periodDays);
}

/**
 * Genera la vista previa de las próximas N fechas de facturación (HLD §4, RF-FAC-04).
 */
export function nextBillingDates(input: BillingPreviewInput, n = 3): BillingPolicyPreviewItem[] {
  const { cycleDay, cutoffDay, policy, today } = input;
  const todayParsed = parseCivilDate(today);

  const results: BillingPolicyPreviewItem[] = [];

  // Empezamos desde el mes actual
  let currentYear = todayParsed.year;
  let currentMonth = todayParsed.month;

  const candidatePeriod = computeBillingPeriod(cycleDay, currentYear, currentMonth);
  const candidateGen = computeGenerationDate(
    candidatePeriod,
    policy.periodTiming,
    policy.generationLeadDays,
  );

  // La vista previa solo incluye fechas de generación de hoy en adelante.
  if (candidateGen < today) {
    currentMonth += 1;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear += 1;
    }
  }

  while (results.length < n) {
    const period = computeBillingPeriod(cycleDay, currentYear, currentMonth);
    const generationDate = computeGenerationDate(
      period,
      policy.periodTiming,
      policy.generationLeadDays,
    );

    const issueDate = generationDate;
    const { dueDate, cutoffDate } = computeDueAndCutoff(period, policy, issueDate, cutoffDay);

    results.push({
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      generationDate,
      dueDate,
      cutoffDate,
    });

    currentMonth += 1;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear += 1;
    }
  }

  return results;
}
