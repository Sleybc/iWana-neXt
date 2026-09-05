import { QUOTE_TAX_RATE_ERROR } from './quote-tax-calc';

export function getQuoteSaveBlockers(input: {
  quoteNumber: string;
  usesQuoteLines: boolean;
  hasQuotedLines: boolean;
  quoteAmountValid: boolean;
  shippingValid: boolean;
  taxesValid: boolean;
}): string[] {
  const blockers: string[] = [];
  if (input.quoteNumber.trim().length === 0) {
    blockers.push('Indica el número de cotización para guardar.');
  }
  if (input.usesQuoteLines ? !input.hasQuotedLines : !input.quoteAmountValid) {
    blockers.push(
      input.usesQuoteLines
        ? 'Indica el costo unitario de al menos un producto.'
        : 'Indica un monto mayor a cero.',
    );
  }
  if (!input.shippingValid) {
    blockers.push('Ingresa un monto de envío válido (cero o mayor).');
  }
  if (!input.taxesValid) {
    blockers.push(QUOTE_TAX_RATE_ERROR);
  }
  return blockers;
}
