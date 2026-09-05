import { QuoteShippingArrangement } from '@iwana/shared';
import type { SupplierQuoteRecord } from '@/lib/api-client';
import {
  hydrateQuoteShipping,
  hydrateQuoteTaxes,
  hydrateQuoteUnitCosts,
} from './quote-form-hydrate';

function buildQuote(overrides: Partial<SupplierQuoteRecord> = {}): SupplierQuoteRecord {
  return {
    id: 'quote-1',
    tenantId: 'tenant-1',
    purchaseRequestId: 'req-1',
    partyRefId: 'party-1',
    quoteNumber: 'COT-100',
    amount: '15000',
    shippingCost: '250',
    shippingArrangement: QuoteShippingArrangement.ON_INVOICE,
    currency: 'COP',
    validUntil: null,
    notes: null,
    rfqId: null,
    rfqInvitationId: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('quote-form-hydrate', () => {
  it('hidrata envío gratis sin monto y el resto con el costo persistido', () => {
    expect(
      hydrateQuoteShipping(buildQuote({ shippingArrangement: QuoteShippingArrangement.FREE })),
    ).toEqual({ arrangement: QuoteShippingArrangement.FREE, amount: '' });
    expect(hydrateQuoteShipping(buildQuote({ shippingCost: '0' }))).toEqual({
      arrangement: QuoteShippingArrangement.ON_INVOICE,
      amount: '',
    });
    expect(
      hydrateQuoteShipping(
        buildQuote({
          shippingArrangement: QuoteShippingArrangement.PAY_CARRIER,
          shippingCost: '40.50',
        }),
      ),
    ).toEqual({ arrangement: QuoteShippingArrangement.PAY_CARRIER, amount: '40.5' });
  });

  it('enciende los tributos persistidos y deja el resto apagado', () => {
    const taxes = hydrateQuoteTaxes(
      buildQuote({
        taxes: [
          {
            code: 'IVA_19',
            name: 'IVA',
            category: 'VAT',
            effect: 'ADD',
            applies: true,
            rate: '19.0000',
            baseAmount: '15000.00',
            taxAmount: '2850.00',
          },
        ],
      }),
    );

    expect(taxes.IVA_19).toEqual({ applies: true, rate: '19' });
    expect(taxes.RETE_FUENTE_SERVICIOS.applies).toBe(false);
    expect(taxes.RETE_ICA.applies).toBe(false);
    expect(taxes.RETE_IVA.applies).toBe(false);
  });

  it('hidrata unitarios por línea de solicitud', () => {
    expect(
      hydrateQuoteUnitCosts(
        buildQuote({
          lines: [
            {
              id: 'ql-1',
              tenantId: 'tenant-1',
              supplierQuoteId: 'quote-1',
              purchaseRequestLineId: 'line-1',
              quantity: '10',
              unitCost: '1500.00',
              lineAmount: '15000.00',
              createdAt: '2026-07-01T00:00:00.000Z',
              updatedAt: '2026-07-01T00:00:00.000Z',
            },
          ],
        }),
      ),
    ).toEqual({ 'line-1': '1500' });
  });
});
