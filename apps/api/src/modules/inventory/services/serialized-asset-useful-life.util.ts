import {
  SerializedAssetUsefulLife,
  UsefulLifeStatus,
} from '../types/serialized-asset-detail.types';

interface UsefulLifeInput {
  usefulLifeMonths: number | null;
  purchaseDate: string | null;
  warrantyUntil: string | null;
  referenceDate?: Date;
}

function monthsBetween(startDate: string, endDate: Date): number {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(
    Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()),
  );
  const monthDiff =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth());
  return Math.max(0, monthDiff);
}

function resolveUsefulLifeStatus(monthsRemaining: number | null): UsefulLifeStatus {
  if (monthsRemaining === null) {
    return 'sin-dato';
  }
  if (monthsRemaining <= 0) {
    return 'vencida';
  }
  if (monthsRemaining <= 3) {
    return 'por-vencer';
  }
  return 'vigente';
}

export function calculateUsefulLife(input: UsefulLifeInput): SerializedAssetUsefulLife {
  const { usefulLifeMonths, purchaseDate, warrantyUntil } = input;
  const referenceDate = input.referenceDate ?? new Date();

  if (!usefulLifeMonths || !purchaseDate) {
    return {
      monthsTotal: usefulLifeMonths,
      monthsElapsed: null,
      monthsRemaining: null,
      warrantyUntil,
      status: 'sin-dato',
    };
  }

  const monthsElapsed = monthsBetween(purchaseDate, referenceDate);
  const monthsRemaining = usefulLifeMonths - monthsElapsed;

  return {
    monthsTotal: usefulLifeMonths,
    monthsElapsed,
    monthsRemaining,
    warrantyUntil,
    status: resolveUsefulLifeStatus(monthsRemaining),
  };
}
