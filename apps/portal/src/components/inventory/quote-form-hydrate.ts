import { QuoteShippingArrangement } from '@iwana/shared';
import type { PurchaseTaxPresetRecord, SupplierQuoteRecord } from '@/lib/api-client';
import {
  createInitialQuoteTaxState,
  formatQuoteTaxRate,
  QUOTE_TAX_CODES,
  type QuoteTaxCode,
  type QuoteTaxState,
  resolveQuoteShippingArrangement,
} from './quote-tax-calc';
import type { QuoteShippingValue } from './QuoteShippingFields';
import type { QuoteLineUnitCostMap } from './SupplierQuoteLinesEditor';

function toMoneyNumber(value: string | number | null | undefined): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  const parsed = Number.parseFloat(value ?? '0');
  return Number.isFinite(parsed) ? parsed : 0;
}

function isQuoteTaxCode(value: string): value is QuoteTaxCode {
  return (QUOTE_TAX_CODES as readonly string[]).includes(value);
}

export function hydrateQuoteShipping(quote: SupplierQuoteRecord): QuoteShippingValue {
  const arrangement = resolveQuoteShippingArrangement(quote);
  if (arrangement === QuoteShippingArrangement.FREE) {
    return { arrangement, amount: '' };
  }
  const cost = toMoneyNumber(quote.shippingCost);
  return {
    arrangement,
    amount: cost === 0 ? '' : String(cost),
  };
}

export function hydrateQuoteTaxes(
  quote: SupplierQuoteRecord,
  presets?: PurchaseTaxPresetRecord[] | undefined,
): QuoteTaxState {
  const next = createInitialQuoteTaxState(presets);
  for (const tax of quote.taxes ?? []) {
    if (!isQuoteTaxCode(tax.code) || tax.applies === false) {
      continue;
    }
    next[tax.code] = {
      applies: true,
      rate: formatQuoteTaxRate(toMoneyNumber(tax.rate)),
    };
  }
  return next;
}

export function hydrateQuoteUnitCosts(quote: SupplierQuoteRecord): QuoteLineUnitCostMap {
  const unitCosts: QuoteLineUnitCostMap = {};
  for (const line of quote.lines ?? []) {
    unitCosts[line.purchaseRequestLineId] = String(toMoneyNumber(line.unitCost));
  }
  return unitCosts;
}
