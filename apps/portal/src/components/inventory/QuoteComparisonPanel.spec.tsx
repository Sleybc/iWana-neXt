import { render, screen } from '@testing-library/react';
import type { SupplierQuoteRecord } from '@/lib/api-client';
import { formatInventoryCurrency } from './inventory-labels';
import { QuoteComparisonPanel } from './QuoteComparisonPanel';

function buildQuote(overrides: Partial<SupplierQuoteRecord> = {}): SupplierQuoteRecord {
  return {
    id: 'quote-1',
    tenantId: 'tenant-1',
    purchaseRequestId: 'req-1',
    partyRefId: 'party-1',
    quoteNumber: 'COT-100',
    amount: '15000',
    shippingCost: '0',
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

describe('QuoteComparisonPanel', () => {
  it('muestra empty state cuando no hay cotizaciones', () => {
    render(<QuoteComparisonPanel quotes={[]} />);
    expect(screen.getByText('Aún no hay cotizaciones registradas.')).toBeInTheDocument();
  });

  it('CA-18-05: muestra desglose por línea cuando la cotización trae lines', () => {
    render(
      <QuoteComparisonPanel
        quotes={[
          buildQuote({
            lines: [
              {
                id: 'ql-1',
                tenantId: 'tenant-1',
                supplierQuoteId: 'quote-1',
                purchaseRequestLineId: 'line-1',
                quantity: '10',
                unitCost: '1500',
                lineAmount: '15000',
                createdAt: '2026-07-01T00:00:00.000Z',
                updatedAt: '2026-07-01T00:00:00.000Z',
              },
            ],
          }),
        ]}
        supplierLabels={{ 'party-1': 'Proveedor Alfa' }}
      />,
    );

    expect(screen.getByText('Proveedor Alfa')).toBeInTheDocument();
    expect(screen.getByText(/COT-100/)).toBeInTheDocument();
    expect(screen.getByText(/Cantidad 10/)).toBeInTheDocument();
    expect(
      screen.getByText((_content, element) => {
        const text = element?.textContent?.replace(/\u00a0/g, ' ') ?? '';
        return (
          element?.tagName === 'SPAN' &&
          element.classList.contains('tabular-nums') &&
          text === formatInventoryCurrency('1500').replace(/\u00a0/g, ' ')
        );
      }),
    ).toBeInTheDocument();
  });

  it('CA-18-05: quote legacy sin lines solo muestra el total', () => {
    render(<QuoteComparisonPanel quotes={[buildQuote({ lines: [] })]} />);

    expect(screen.getByText(/COT-100/)).toBeInTheDocument();
    expect(screen.queryByText(/Cant\./)).not.toBeInTheDocument();
  });

  it('CA-23-02: muestra nombre de proveedor y fallback amigable', () => {
    render(
      <QuoteComparisonPanel
        quotes={[buildQuote({ partyRefId: 'party-unknown' })]}
        supplierLabels={{ 'party-1': 'Proveedor Alfa' }}
      />,
    );

    expect(screen.getByText('Proveedor no identificado')).toBeInTheDocument();
    expect(screen.queryByText('party-unknown')).not.toBeInTheDocument();
  });

  it('CA-19-03: muestra productos, envío y total con envío', () => {
    render(
      <QuoteComparisonPanel
        quotes={[
          buildQuote({
            id: 'q-a',
            quoteNumber: 'COT-A',
            amount: '10000',
            shippingCost: '5000',
            partyRefId: 'party-a',
          }),
          buildQuote({
            id: 'q-b',
            quoteNumber: 'COT-B',
            amount: '10000',
            shippingCost: '0',
            partyRefId: 'party-b',
          }),
        ]}
        supplierLabels={{ 'party-a': 'Proveedor A', 'party-b': 'Proveedor B' }}
      />,
    );

    expect(screen.getByText('Gratis')).toBeInTheDocument();
    expect(screen.getAllByText('Total con envío')).toHaveLength(2);
    expect(screen.queryByText(/landed/i)).not.toBeInTheDocument();
    // COT-B (total con envío 10000) aparece antes que COT-A (15000)
    const numbers = screen.getAllByText(/COT-/).map((node) => node.textContent ?? '');
    expect(numbers.findIndex((text) => text.includes('COT-B'))).toBeLessThan(
      numbers.findIndex((text) => text.includes('COT-A')),
    );
  });
});
