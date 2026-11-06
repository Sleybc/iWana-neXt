import { prorate } from '@iwana/shared';
import type { BillingProrationMethod } from '@iwana/shared';

export interface PlanLineInput {
  price: string;
  coveredDays: number;
  periodDays: number;
  method: BillingProrationMethod;
  treatment: string;
  ratePercent: 0 | 19;
  legalBasis: string | null;
  description: string;
}

export interface BillingLineValue {
  kind: 'PLAN' | 'PRORRATEO';
  description: string;
  quantity: string;
  unitPrice: string;
  baseAmount: string;
  taxAmount: string;
  total: string;
  vatTreatment: string;
  vatRate: string;
  vatLegalBasis: string | null;
  position: number;
}

function roundCents(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function money(amount: number): string {
  return roundCents(amount).toFixed(2);
}

export function buildPlanLine(input: PlanLineInput): BillingLineValue {
  const numericPrice = Number(input.price);
  if (!Number.isFinite(numericPrice) || numericPrice < 0) {
    throw new RangeError('El precio mensual debe ser válido y no negativo.');
  }
  if (!Number.isInteger(input.coveredDays) || input.coveredDays < 0) {
    throw new RangeError('Los días cubiertos deben ser un entero no negativo.');
  }
  if (!Number.isInteger(input.periodDays) || input.periodDays <= 0) {
    throw new RangeError('Los días del periodo deben ser un entero positivo.');
  }
  if (input.ratePercent !== 0 && input.ratePercent !== 19) {
    throw new RangeError('El porcentaje de IVA no está soportado.');
  }

  const base =
    input.coveredDays === input.periodDays
      ? roundCents(numericPrice)
      : roundCents(prorate(input.price, input.coveredDays, input.periodDays, input.method));
  const tax = roundCents((base * input.ratePercent) / 100);
  const partial = input.coveredDays !== input.periodDays;
  return {
    kind: partial ? 'PRORRATEO' : 'PLAN',
    description: input.description,
    quantity: '1.0000',
    unitPrice: money(numericPrice),
    baseAmount: money(base),
    taxAmount: money(tax),
    total: money(base + tax),
    vatTreatment: input.treatment,
    vatRate: `${input.ratePercent.toFixed(4)}`,
    vatLegalBasis: input.legalBasis,
    position: 0,
  };
}
