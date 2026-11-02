interface CutoffDateInput {
  cycleDay: number;
  cutoffDay: number;
  year: number;
  month: number;
}

interface NextCutoffDateInput {
  cycleDay: number;
  cutoffDay: number;
  today: string;
}

function validateCycle(cycleDay: number, cutoffDay: number): void {
  if (!Number.isInteger(cycleDay) || cycleDay < 1 || cycleDay > 28) {
    throw new RangeError('El día de facturación debe estar entre 1 y 28.');
  }
  if (!Number.isInteger(cutoffDay) || cutoffDay < 1 || cutoffDay > 31 || cutoffDay <= cycleDay) {
    throw new RangeError('La fecha de corte debe ser mayor al día de facturación y no superar 31.');
  }
}

function parseDate(value: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) throw new RangeError('La fecha debe tener formato YYYY-MM-DD.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const actualDay = daysInMonth(year, month);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > actualDay) {
    throw new RangeError('La fecha civil no es válida.');
  }
  return { year, month, day };
}

function formatDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Calcula el corte del periodo sin desplazarlo por fines de semana o festivos (ADR-102 D5). */
export function computeCutoffDate(input: CutoffDateInput): string {
  validateCycle(input.cycleDay, input.cutoffDay);
  if (!Number.isInteger(input.year) || input.year < 1 || input.year > 9999) {
    throw new RangeError('El año debe estar entre 1 y 9999.');
  }
  if (!Number.isInteger(input.month) || input.month < 1 || input.month > 12) {
    throw new RangeError('El mes debe estar entre 1 y 12.');
  }
  const lastDay = daysInMonth(input.year, input.month);
  return formatDate(input.year, input.month, Math.min(input.cutoffDay, lastDay));
}

/** Calcula el corte vigente o siguiente usando la fecha local del tenant (ADR-102 D5). */
export function computeNextCutoffDate(input: NextCutoffDateInput): string {
  validateCycle(input.cycleDay, input.cutoffDay);
  const today = parseDate(input.today);
  const currentMonthCutoff = computeCutoffDate({
    cycleDay: input.cycleDay,
    cutoffDay: input.cutoffDay,
    year: today.year,
    month: today.month,
  });
  if (input.today <= currentMonthCutoff) return currentMonthCutoff;

  const year = today.month === 12 ? today.year + 1 : today.year;
  const month = today.month === 12 ? 1 : today.month + 1;
  if (year > 9999) throw new RangeError('La fecha queda fuera del rango admitido.');
  return computeCutoffDate({ cycleDay: input.cycleDay, cutoffDay: input.cutoffDay, year, month });
}
