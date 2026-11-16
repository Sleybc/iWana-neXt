import type { BillingCycleOption } from '@/lib/api-client';

const BILLING_TIME_ZONE = 'America/Bogota';

/**
 * Fecha civil (YYYY-MM-DD) de un valor que puede traer hora (ISO con `T`): las marcas de tiempo se
 * llevan a la hora de Colombia para no mostrar el día siguiente ni un día ilegible.
 */
function civilDatePart(value: string): string {
  if (!value.includes('T')) return value;
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BILLING_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

const SHORT_MONTHS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

/** Fecha civil corta para tablas: «27 nov 2026» (también acepta una marca de tiempo). */
export function formatBillingShortDate(value: string): string {
  const [year, month, day] = civilDatePart(value).split('-');
  const monthName = SHORT_MONTHS[Number(month) - 1];
  if (!year || !day || !monthName) return value;
  return `${Number(day)} ${monthName} ${year}`;
}

/** Presenta YYYY-MM-DD como fecha civil y conserva el día sin conversión horaria. */
export function formatBillingDate(value: string): string {
  const [year, month, day] = value.split('-');
  const monthName = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ][Number(month) - 1];

  if (!year || !day || !monthName) return value;
  return `${Number(day)} de ${monthName} de ${year}`;
}

export function findBillingCycle(
  cycles: BillingCycleOption[],
  cycleDay: number | null | undefined,
): BillingCycleOption | undefined {
  return cycles.find((cycle) => cycle.cycleDay === cycleDay);
}

/** Solo sugiere valores que coinciden exactamente con la representación decimal del expediente. */
export function suggestedCycleDay(
  cycles: BillingCycleOption[],
  inheritedValue: string | null | undefined,
): number | undefined {
  if (inheritedValue == null) return undefined;
  return cycles.find((cycle) => String(cycle.cycleDay) === inheritedValue)?.cycleDay;
}
