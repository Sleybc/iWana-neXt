import { PERMANENCE_MAX_MONTHS, type ContractPermanence } from '@iwana/shared';

/**
 * Permanencia mínima (cierre de venta, bloque H; CA-13). Funciones puras, sin I/O.
 *
 * Tabla del PDF: valor a pagar si el contrato termina en el mes k (1..N), prorrateado por
 * meses restantes: `valor_k = round(monto * (N - k + 1) / N)` en centavos. Es no creciente,
 * el mes 1 vale el monto completo y ningún mes lo supera.
 */
export interface PermanenceScheduleRow {
  month: number;
  amount: number;
}

function assertMonths(months: number): void {
  if (!Number.isInteger(months) || months < 1 || months > PERMANENCE_MAX_MONTHS) {
    throw new RangeError(`La permanencia va de 1 a ${PERMANENCE_MAX_MONTHS} meses.`);
  }
}

function toCents(amount: number): number {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new RangeError('El valor de la permanencia es un monto no negativo.');
  }
  return Math.round(amount * 100);
}

export function computePermanenceSchedule(
  discountedOrDeferredAmount: number,
  months: number,
): PermanenceScheduleRow[] {
  assertMonths(months);
  const cents = toCents(discountedOrDeferredAmount);
  return Array.from({ length: months }, (_, index) => {
    const month = index + 1;
    const remaining = months - month + 1;
    return { month, amount: Math.round((cents * remaining) / months) / 100 };
  });
}

const CIVIL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;

function parseCivilDate(value: string): Date {
  const match = CIVIL_DATE.exec(value);
  if (!match) throw new RangeError(`Fecha civil inválida: ${value}`);
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new RangeError(`Fecha civil inválida: ${value}`);
  }
  return date;
}

function formatCivilDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Fin de la permanencia: inicio + N meses (si el día no existe, último día del mes). */
export function computePermanenceEndDate(startDate: string, months: number): string {
  assertMonths(months);
  const start = parseCivilDate(startDate);
  const targetMonthIndex = start.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(start.getUTCFullYear(), targetMonthIndex + 1, 0)).getUTCDate();
  const end = new Date(
    Date.UTC(start.getUTCFullYear(), targetMonthIndex, Math.min(start.getUTCDate(), lastDay)),
  );
  return formatCivilDate(end);
}

/**
 * Corrimiento del fin por suspensión voluntaria: el fin se mueve los días suspendidos.
 * Expuesta para el ciclo de vida (suspensión/reactivación) en una fase posterior.
 */
export function shiftPermanenceEndDate(endDate: string, suspendedDays: number): string {
  if (!Number.isInteger(suspendedDays) || suspendedDays < 0) {
    throw new RangeError('Los días de suspensión son un entero no negativo.');
  }
  const end = parseCivilDate(endDate);
  end.setUTCDate(end.getUTCDate() + suspendedDays);
  return formatCivilDate(end);
}

/** Forma del contrato sin permanencia (siempre disponible). */
export const NO_PERMANENCE: ContractPermanence = {
  accepted: false,
  months: null,
  connectionFee: null,
  discountedOrDeferredAmount: null,
  startDate: null,
  endDate: null,
  schedule: [],
};
