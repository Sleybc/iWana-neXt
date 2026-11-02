import type { BillingCycleOption } from '@/lib/api-client';

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
