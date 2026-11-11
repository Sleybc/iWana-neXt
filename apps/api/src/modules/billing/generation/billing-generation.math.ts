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
  kind: 'PLAN' | 'PRORRATEO' | 'INSTALACION';
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

/** Prefijo estable de la línea de instalación (bloque D, CA-4/CA-5). */
export const INSTALLATION_LINE_DESCRIPTION = 'Instalación';

export interface InstallationLineInput {
  fee: string | null | undefined;
  permanenceDiscount: string | null | undefined;
  treatment: string;
  ratePercent: 0 | 19;
  legalBasis: string | null;
}

function copMoney(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Línea «Instalación» del primer cobro: cobra el cargo congelado menos el valor descontado
 * o diferido por permanencia aceptada; el descuento queda visible en la descripción y en
 * la diferencia entre precio unitario y base. Con descuento total sale en cero. IVA: el
 * mismo tratamiento del servicio de internet del contrato (D-F1, ADR-093). Sin cargo
 * (nulo o cero) no hay línea.
 */
export function buildInstallationLine(input: InstallationLineInput): BillingLineValue | null {
  if (input.fee === null || input.fee === undefined) return null;
  const fee = Number(input.fee);
  if (!Number.isFinite(fee) || fee < 0) {
    throw new RangeError('El cargo de instalación debe ser válido y no negativo.');
  }
  if (roundCents(fee) === 0) return null;
  if (input.ratePercent !== 0 && input.ratePercent !== 19) {
    throw new RangeError('El porcentaje de IVA no está soportado.');
  }
  const rawDiscount = input.permanenceDiscount == null ? 0 : Number(input.permanenceDiscount);
  if (!Number.isFinite(rawDiscount) || rawDiscount < 0) {
    throw new RangeError('El descuento por permanencia debe ser válido y no negativo.');
  }
  // La base nunca es negativa: el descuento se acota al cargo (CHECK de 183 ya lo exige).
  const discount = roundCents(Math.min(rawDiscount, fee));
  const base = roundCents(fee - discount);
  const tax = roundCents((base * input.ratePercent) / 100);
  return {
    kind: 'INSTALACION',
    description:
      discount > 0
        ? `${INSTALLATION_LINE_DESCRIPTION} (cargo ${copMoney(fee)}, descuento por permanencia ${copMoney(discount)})`
        : INSTALLATION_LINE_DESCRIPTION,
    quantity: '1.0000',
    unitPrice: money(fee),
    baseAmount: money(base),
    taxAmount: money(tax),
    total: money(base + tax),
    vatTreatment: input.treatment,
    vatRate: `${input.ratePercent.toFixed(4)}`,
    vatLegalBasis: input.legalBasis,
    position: 1,
  };
}
