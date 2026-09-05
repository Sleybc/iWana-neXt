import type { PurchaseTaxPresetRecord } from '@/lib/api-client';
import { QuoteShippingArrangement } from '@iwana/shared';

export const QUOTE_TAX_CODES = ['IVA_19', 'RETE_FUENTE_SERVICIOS', 'RETE_ICA', 'RETE_IVA'] as const;

export type QuoteTaxCode = (typeof QUOTE_TAX_CODES)[number];

export type QuoteTaxEffect = 'ADD' | 'WITHHOLD';

export interface QuoteTaxFieldDef {
  code: QuoteTaxCode;
  slug: string;
  label: string;
}

/** Vocabulario visible. Los `code` no se renderizan. */
export const QUOTE_TAX_FIELDS: readonly QuoteTaxFieldDef[] = [
  { code: 'IVA_19', slug: 'iva', label: 'IVA' },
  { code: 'RETE_FUENTE_SERVICIOS', slug: 'rete-fuente', label: 'Retención en la fuente' },
  { code: 'RETE_ICA', slug: 'rete-ica', label: 'Rete ICA' },
  { code: 'RETE_IVA', slug: 'rete-iva', label: 'Rete IVA' },
] as const;

const VISIBLE_LABEL_BY_CODE: Record<QuoteTaxCode, string> = {
  IVA_19: 'IVA',
  RETE_FUENTE_SERVICIOS: 'Retención en la fuente',
  RETE_ICA: 'Rete ICA',
  RETE_IVA: 'Rete IVA',
};

const DEFAULT_RATES: Record<QuoteTaxCode, number> = {
  IVA_19: 19,
  RETE_FUENTE_SERVICIOS: 4,
  RETE_ICA: 0.414,
  RETE_IVA: 15,
};

export const QUOTE_TAX_NO_INVOICE_COPY =
  'Estos valores sirven para comparar ofertas y estimar el pago. No son una factura electrónica.';

export const QUOTE_TAX_NOT_SUPPLIER_PROFILE_COPY =
  'Indica qué aplica en esta cotización. No se guarda como perfil del proveedor.';

export const QUOTE_TAX_RATE_ERROR = 'Ingresa una tasa entre 0 y 100.';

export interface QuoteTaxRowState {
  applies: boolean;
  rate: string;
}

export type QuoteTaxState = Record<QuoteTaxCode, QuoteTaxRowState>;

export interface QuoteTaxPayloadItem {
  code: QuoteTaxCode;
  applies: true;
  rate: number;
}

export interface QuoteTaxPreviewLine {
  code: QuoteTaxCode;
  label: string;
  effect: QuoteTaxEffect;
  rate: number;
  baseAmount: number;
  taxAmount: number;
}

export interface QuoteTaxPreview {
  valid: boolean;
  amount: number;
  shippingCost: number;
  lines: QuoteTaxPreviewLine[];
  payable: number | null;
}

function isQuoteTaxCode(value: string): value is QuoteTaxCode {
  return (QUOTE_TAX_CODES as readonly string[]).includes(value);
}

export function getQuoteTaxVisibleLabel(tax: { code?: string; name?: string }): string {
  if (tax.code && isQuoteTaxCode(tax.code)) {
    return VISIBLE_LABEL_BY_CODE[tax.code];
  }
  const name = tax.name?.trim();
  if (name) {
    return name;
  }
  return 'Tributo';
}

export function inferQuoteTaxEffect(code: string): QuoteTaxEffect {
  if (code.startsWith('IVA_')) {
    return 'ADD';
  }
  return 'WITHHOLD';
}

/** HALF_UP a 2 decimales con centavos enteros. */
export function roundHalfUpToCents(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  const scaledRounded = Math.round(abs * 10000);
  const remainder = scaledRounded % 100;
  const cents = Math.trunc(scaledRounded / 100);
  const roundedCents = remainder >= 50 ? cents + 1 : cents;
  return (sign * roundedCents) / 100;
}

export function parseQuoteTaxRate(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return null;
  }
  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    return null;
  }
  return parsed;
}

export function formatQuoteTaxRate(rate: number): string {
  if (!Number.isFinite(rate)) {
    return '';
  }
  return String(rate);
}

export function resolveQuoteTaxDefaultRate(
  code: QuoteTaxCode,
  presets: PurchaseTaxPresetRecord[] | undefined,
): number {
  const preset = presets?.find((entry) => entry.code === code);
  if (preset?.baseRate != null && Number.isFinite(preset.baseRate)) {
    return preset.baseRate;
  }
  return DEFAULT_RATES[code];
}

export function createInitialQuoteTaxState(
  presets?: PurchaseTaxPresetRecord[] | undefined,
): QuoteTaxState {
  return {
    IVA_19: {
      applies: false,
      rate: formatQuoteTaxRate(resolveQuoteTaxDefaultRate('IVA_19', presets)),
    },
    RETE_FUENTE_SERVICIOS: {
      applies: false,
      rate: formatQuoteTaxRate(resolveQuoteTaxDefaultRate('RETE_FUENTE_SERVICIOS', presets)),
    },
    RETE_ICA: {
      applies: false,
      rate: formatQuoteTaxRate(resolveQuoteTaxDefaultRate('RETE_ICA', presets)),
    },
    RETE_IVA: {
      applies: false,
      rate: formatQuoteTaxRate(resolveQuoteTaxDefaultRate('RETE_IVA', presets)),
    },
  };
}

export function areQuoteTaxesValid(state: QuoteTaxState): boolean {
  for (const code of QUOTE_TAX_CODES) {
    const row = state[code];
    if (!row.applies) {
      continue;
    }
    if (parseQuoteTaxRate(row.rate) === null) {
      return false;
    }
  }
  return true;
}

export function buildQuoteTaxesPayload(state: QuoteTaxState): QuoteTaxPayloadItem[] {
  const payload: QuoteTaxPayloadItem[] = [];
  for (const code of QUOTE_TAX_CODES) {
    const row = state[code];
    if (!row.applies) {
      continue;
    }
    const rate = parseQuoteTaxRate(row.rate);
    if (rate === null) {
      continue;
    }
    payload.push({ code, applies: true, rate });
  }
  return payload;
}

function taxAmountOnBase(base: number, rate: number): number {
  return roundHalfUpToCents((base * rate) / 100);
}

export function computeQuoteTaxPreview(input: {
  amount: number;
  shippingCost: number;
  taxes: QuoteTaxState;
}): QuoteTaxPreview {
  const amount = Number.isFinite(input.amount) ? input.amount : 0;
  const shippingCost = Number.isFinite(input.shippingCost) ? input.shippingCost : 0;
  const valid = areQuoteTaxesValid(input.taxes);
  const lines: QuoteTaxPreviewLine[] = [];

  const ivaRow = input.taxes.IVA_19;
  const ivaRate = ivaRow.applies ? parseQuoteTaxRate(ivaRow.rate) : null;
  const ivaAmount = ivaRow.applies && ivaRate !== null ? taxAmountOnBase(amount, ivaRate) : 0;

  if (ivaRow.applies && ivaRate !== null) {
    lines.push({
      code: 'IVA_19',
      label: VISIBLE_LABEL_BY_CODE.IVA_19,
      effect: 'ADD',
      rate: ivaRate,
      baseAmount: roundHalfUpToCents(amount),
      taxAmount: ivaAmount,
    });
  }

  const withholdingOnAmount: QuoteTaxCode[] = ['RETE_FUENTE_SERVICIOS', 'RETE_ICA'];
  for (const code of withholdingOnAmount) {
    const row = input.taxes[code];
    if (!row.applies) {
      continue;
    }
    const rate = parseQuoteTaxRate(row.rate);
    if (rate === null) {
      continue;
    }
    lines.push({
      code,
      label: VISIBLE_LABEL_BY_CODE[code],
      effect: 'WITHHOLD',
      rate,
      baseAmount: roundHalfUpToCents(amount),
      taxAmount: taxAmountOnBase(amount, rate),
    });
  }

  const reteIvaRow = input.taxes.RETE_IVA;
  if (reteIvaRow.applies) {
    const rate = parseQuoteTaxRate(reteIvaRow.rate);
    if (rate !== null) {
      const ivaBase = ivaRow.applies && ivaRate !== null ? ivaAmount : 0;
      lines.push({
        code: 'RETE_IVA',
        label: VISIBLE_LABEL_BY_CODE.RETE_IVA,
        effect: 'WITHHOLD',
        rate,
        baseAmount: roundHalfUpToCents(ivaBase),
        taxAmount: taxAmountOnBase(ivaBase, rate),
      });
    }
  }

  let payable: number | null = null;
  if (valid) {
    let total = amount + shippingCost;
    for (const line of lines) {
      total += line.effect === 'ADD' ? line.taxAmount : -line.taxAmount;
    }
    payable = roundHalfUpToCents(total);
  }

  return {
    valid,
    amount,
    shippingCost,
    lines,
    payable,
  };
}

function toMoneyNumber(value: string | number | null | undefined): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  const parsed = Number.parseFloat(value || '0');
  return Number.isFinite(parsed) ? parsed : 0;
}

export function resolveQuoteShippingArrangement(quote: {
  shippingArrangement?: string | null;
  shippingCost?: string | number | null;
}): QuoteShippingArrangement {
  const raw = quote.shippingArrangement;
  if (
    raw === QuoteShippingArrangement.FREE ||
    raw === QuoteShippingArrangement.ON_INVOICE ||
    raw === QuoteShippingArrangement.PAY_CARRIER
  ) {
    return raw;
  }
  return toMoneyNumber(quote.shippingCost) === 0
    ? QuoteShippingArrangement.FREE
    : QuoteShippingArrangement.ON_INVOICE;
}

export function resolveQuotePayableAmount(quote: {
  amount: string | number;
  shippingCost: string | number;
  payableAmount?: string | number | null;
  shippingArrangement?: string | null;
}): number {
  if (quote.payableAmount != null && String(quote.payableAmount).trim() !== '') {
    const parsed = Number.parseFloat(String(quote.payableAmount));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  const amount = toMoneyNumber(quote.amount);
  const shipping = toMoneyNumber(quote.shippingCost);
  const arrangement = resolveQuoteShippingArrangement(quote);
  return arrangement === QuoteShippingArrangement.ON_INVOICE ? amount + shipping : amount;
}

export function resolveQuoteOfferTotal(quote: {
  amount: string | number;
  shippingCost: string | number;
  payableAmount?: string | number | null;
  shippingArrangement?: string | null;
}): number {
  const payable = resolveQuotePayableAmount(quote);
  const arrangement = resolveQuoteShippingArrangement(quote);
  if (arrangement === QuoteShippingArrangement.PAY_CARRIER) {
    return payable + toMoneyNumber(quote.shippingCost);
  }
  return payable;
}
