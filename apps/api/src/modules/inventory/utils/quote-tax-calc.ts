import { TaxCategory, TaxContext, TaxQuoteEffect } from '@iwana/shared';

/**
 * Snapshot mínimo del catálogo (shape de TaxDefinitionSnapshot) para el motor
 * puro de cotización. No acopla a la entidad TypeORM de Taxation.
 */
export type QuoteTaxCatalogSnapshot = {
  id: string;
  code: string;
  name: string;
  category: string;
  baseRate: string | null;
  treatment: string;
  context: string;
  isActive: boolean;
};

export type QuoteTaxInput = {
  code: string;
  applies: boolean;
  rate?: number | undefined;
};

export type QuoteTaxCalcLine = {
  taxCode: string;
  name: string;
  taxCategory: string;
  effect: TaxQuoteEffect;
  rate: number;
  baseAmount: number;
  taxAmount: number;
  taxDefinitionId: string | null;
};

export type QuoteTaxCalcResult = {
  payableAmount: number;
  taxes: QuoteTaxCalcLine[];
};

export type SupplierQuoteTaxApiSnapshot = {
  code: string;
  name: string;
  category: string;
  effect: TaxQuoteEffect;
  applies: true;
  rate: string;
  baseAmount: string;
  taxAmount: string;
};

export function toSupplierQuoteTaxApiSnapshot(line: QuoteTaxCalcLine): SupplierQuoteTaxApiSnapshot {
  return {
    code: line.taxCode,
    name: line.name,
    category: line.taxCategory,
    effect: line.effect,
    applies: true,
    rate: formatTaxRate(line.rate),
    baseAmount: line.baseAmount.toFixed(2),
    taxAmount: line.taxAmount.toFixed(2),
  };
}

export class QuoteTaxCalcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuoteTaxCalcError';
  }
}

const RETE_IVA_CODE = 'RETE_IVA';
const RATE_DECIMALS = 4;

/**
 * HALF_UP a centavos sin la trampa IEEE de `1.005 * 100`.
 * Escala por notación científica en string para no perder el 5 de redondeo.
 */
export function roundHalfUpToCents(n: number): number {
  if (!Number.isFinite(n)) {
    return 0;
  }
  const sign = n < 0 ? -1 : 1;
  const rounded = Number(`${Math.round(Number(`${Math.abs(n)}e2`))}e-2`);
  return sign * rounded;
}

export function formatTaxRate(rate: number): string {
  return Number(rate.toFixed(RATE_DECIMALS)).toFixed(RATE_DECIMALS);
}

function parseCatalogRate(baseRate: string | null): number | null {
  if (baseRate == null || String(baseRate).trim() === '') {
    return null;
  }
  const parsed = Number(baseRate);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveEffect(entry: QuoteTaxCatalogSnapshot): TaxQuoteEffect | null {
  if (entry.category === TaxCategory.VAT) {
    return TaxQuoteEffect.ADD;
  }
  if (entry.code === RETE_IVA_CODE) {
    return TaxQuoteEffect.WITHHOLD;
  }
  if (entry.category === TaxCategory.WITHHOLDING || entry.category === TaxCategory.MUNICIPAL) {
    return TaxQuoteEffect.WITHHOLD;
  }
  return null;
}

function isPurchaseCatalogContext(context: string): boolean {
  return context === TaxContext.PURCHASE || context === TaxContext.BOTH;
}

function resolveAppliedRate(input: QuoteTaxInput, entry: QuoteTaxCatalogSnapshot): number {
  if (input.rate !== undefined) {
    if (!Number.isFinite(input.rate) || input.rate < 0 || input.rate > 100) {
      throw new QuoteTaxCalcError('La tasa del tributo debe estar entre 0 y 100.');
    }
    return input.rate;
  }

  const catalogRate = parseCatalogRate(entry.baseRate);
  if (catalogRate == null) {
    throw new QuoteTaxCalcError(
      `Indica la tasa del tributo ${entry.name} (el catálogo no tiene una tasa por defecto).`,
    );
  }
  if (catalogRate < 0 || catalogRate > 100) {
    throw new QuoteTaxCalcError('La tasa del tributo debe estar entre 0 y 100.');
  }
  return catalogRate;
}

/**
 * Motor puro de tributos de cotización de compra.
 * `shippingCost` entra en el neto, nunca en las bases.
 */
export function computeQuoteTaxes(input: {
  amount: number;
  shippingCost: number;
  taxes: readonly QuoteTaxInput[];
  catalog: readonly QuoteTaxCatalogSnapshot[];
}): QuoteTaxCalcResult {
  const amount = roundHalfUpToCents(input.amount);
  const shippingCost = roundHalfUpToCents(input.shippingCost);
  const catalogByCode = new Map(input.catalog.map((entry) => [entry.code, entry]));

  const seenCodes = new Set<string>();
  for (const tax of input.taxes) {
    if (seenCodes.has(tax.code)) {
      throw new QuoteTaxCalcError('Hay códigos de tributo duplicados en la cotización.');
    }
    seenCodes.add(tax.code);

    const entry = catalogByCode.get(tax.code);
    if (!entry || !entry.isActive || !isPurchaseCatalogContext(entry.context)) {
      throw new QuoteTaxCalcError(
        'Uno o más tributos no pertenecen al catálogo de compras o están inactivos.',
      );
    }

    if (!tax.applies) {
      continue;
    }

    const effect = resolveEffect(entry);
    if (effect == null) {
      throw new QuoteTaxCalcError('Este tributo no se puede aplicar en la cotización.');
    }
    resolveAppliedRate(tax, entry);
  }

  const applied = input.taxes.filter((tax) => tax.applies);
  let vatAddTotal = 0;
  const vatLines: QuoteTaxCalcLine[] = [];
  const otherInputs: QuoteTaxInput[] = [];

  for (const tax of applied) {
    const entry = catalogByCode.get(tax.code);
    if (!entry) {
      continue;
    }
    if (entry.category === TaxCategory.VAT) {
      const rate = resolveAppliedRate(tax, entry);
      const baseAmount = amount;
      const taxAmount = roundHalfUpToCents((baseAmount * rate) / 100);
      vatAddTotal = roundHalfUpToCents(vatAddTotal + taxAmount);
      vatLines.push({
        taxCode: entry.code,
        name: entry.name,
        taxCategory: entry.category,
        effect: TaxQuoteEffect.ADD,
        rate,
        baseAmount,
        taxAmount,
        taxDefinitionId: entry.id,
      });
    } else {
      otherInputs.push(tax);
    }
  }

  const otherLines: QuoteTaxCalcLine[] = [];
  for (const tax of otherInputs) {
    const entry = catalogByCode.get(tax.code);
    if (!entry) {
      continue;
    }
    const rate = resolveAppliedRate(tax, entry);
    const effect = resolveEffect(entry) ?? TaxQuoteEffect.WITHHOLD;
    const baseAmount = entry.code === RETE_IVA_CODE ? vatAddTotal : amount;
    const taxAmount = roundHalfUpToCents((baseAmount * rate) / 100);
    otherLines.push({
      taxCode: entry.code,
      name: entry.name,
      taxCategory: entry.category,
      effect,
      rate,
      baseAmount,
      taxAmount,
      taxDefinitionId: entry.id,
    });
  }

  const taxes = [...vatLines, ...otherLines];
  const addTotal = taxes
    .filter((line) => line.effect === TaxQuoteEffect.ADD)
    .reduce((total, line) => total + line.taxAmount, 0);
  const withholdTotal = taxes
    .filter((line) => line.effect === TaxQuoteEffect.WITHHOLD)
    .reduce((total, line) => total + line.taxAmount, 0);

  const payableAmount = roundHalfUpToCents(amount + shippingCost + addTotal - withholdTotal);

  return { payableAmount, taxes };
}
