import type { BillingBuyerSnapshot } from './billing-documents.contract';

/** Texto canónico para el adquirente oculto (spec UX §4.1, vocabulario). */
export const BILLING_BLOCKED_BUYER_DISPLAY_NAME = '[Dato protegido por custodia legal]';

/** Única forma del adquirente oculto para listas, detalle, estado de cuenta y PDF. */
export function redactedBillingBuyer(): BillingBuyerSnapshot {
  return {
    displayName: BILLING_BLOCKED_BUYER_DISPLAY_NAME,
    documentType: null,
    documentNumber: null,
    address: null,
    rutResponsibilities: [],
  };
}
