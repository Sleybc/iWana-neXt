import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SupplierQuoteRecord } from '@/lib/api-client';
import { formatInventoryMoney } from './inventory-labels';
import { QuoteComparisonPanel } from './QuoteComparisonPanel';
import { QUOTE_TAX_NO_INVOICE_COPY } from './quote-tax-calc';

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
          text === formatInventoryMoney('1500').replace(/\u00a0/g, ' ')
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

  it('CA-25-10: ordena por neto, hero Neto a pagar y copy de no-factura', () => {
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
    expect(screen.getAllByText('Neto a pagar')).toHaveLength(2);
    expect(screen.getAllByText('Base').length).toBeGreaterThan(0);
    expect(screen.getByText(QUOTE_TAX_NO_INVOICE_COPY)).toBeInTheDocument();
    expect(screen.queryByText(/landed/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Total con envío')).not.toBeInTheDocument();
    const numbers = screen.getAllByText(/COT-/).map((node) => node.textContent ?? '');
    expect(numbers.findIndex((text) => text.includes('COT-B'))).toBeLessThan(
      numbers.findIndex((text) => text.includes('COT-A')),
    );
  });

  it('CA-25-10: desglosa tributos activos y ordena por neto persistido', () => {
    render(
      <QuoteComparisonPanel
        quotes={[
          buildQuote({
            id: 'q-high',
            quoteNumber: 'COT-ALTA',
            amount: '100',
            shippingCost: '0',
            payableAmount: '119',
            partyRefId: 'party-a',
            taxes: [
              {
                code: 'IVA_19',
                name: 'IVA 19%',
                category: 'VAT',
                effect: 'ADD',
                applies: true,
                rate: 19,
                baseAmount: '100',
                taxAmount: '19',
              },
            ],
          }),
          buildQuote({
            id: 'q-low',
            quoteNumber: 'COT-BAJA',
            amount: '100',
            shippingCost: '0',
            payableAmount: '96',
            partyRefId: 'party-b',
            taxes: [
              {
                code: 'RETE_FUENTE_SERVICIOS',
                name: 'Retención en la fuente — Servicios',
                category: 'WITHHOLDING',
                effect: 'WITHHOLD',
                applies: true,
                rate: 4,
                baseAmount: '100',
                taxAmount: '4',
              },
            ],
          }),
        ]}
        supplierLabels={{ 'party-a': 'Proveedor A', 'party-b': 'Proveedor B' }}
      />,
    );

    expect(screen.getByText('IVA')).toBeInTheDocument();
    expect(screen.getByText('Retención en la fuente')).toBeInTheDocument();
    expect(screen.queryByText('IVA_19')).not.toBeInTheDocument();
    expect(screen.queryByText('WITHHOLDING')).not.toBeInTheDocument();
    const numbers = screen.getAllByText(/COT-/).map((node) => node.textContent ?? '');
    expect(numbers.findIndex((text) => text.includes('COT-BAJA'))).toBeLessThan(
      numbers.findIndex((text) => text.includes('COT-ALTA')),
    );
  });

  it('ordena por costo total de la oferta cuando el flete se paga al transportador', () => {
    render(
      <QuoteComparisonPanel
        quotes={[
          buildQuote({
            id: 'q-carrier',
            quoteNumber: 'COT-FLETE',
            amount: '100',
            shippingCost: '50',
            payableAmount: '100',
            shippingArrangement: 'PAY_CARRIER',
            partyRefId: 'party-a',
          }),
          buildQuote({
            id: 'q-free',
            quoteNumber: 'COT-BARATA',
            amount: '120',
            shippingCost: '0',
            payableAmount: '120',
            shippingArrangement: 'FREE',
            partyRefId: 'party-b',
          }),
        ]}
        supplierLabels={{ 'party-a': 'Proveedor A', 'party-b': 'Proveedor B' }}
      />,
    );

    expect(screen.getByText(/al transportador/)).toBeInTheDocument();
    expect(screen.getByText('Total de la oferta')).toBeInTheDocument();
    const numbers = screen.getAllByText(/COT-/).map((node) => node.textContent ?? '');
    expect(numbers.findIndex((text) => text.includes('COT-BARATA'))).toBeLessThan(
      numbers.findIndex((text) => text.includes('COT-FLETE')),
    );
  });

  it('muestra nombre y SKU cuando recibe líneas e ítems (FE-3, spec §10)', () => {
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
        requestLines={
          [
            {
              id: 'line-1',
              tenantId: 'tenant-1',
              purchaseRequestId: 'req-1',
              sourceKind: 'INVENTORY_ITEM',
              inventoryItemId: 'item-1',
              freeTextDescription: null,
              quantityRequested: '10',
              unitOfMeasure: 'unidad',
              suggestedPartyRefId: null,
              lineStatus: 'OPEN',
              notes: null,
              createdAt: '2026-07-01T00:00:00.000Z',
              updatedAt: '2026-07-01T00:00:00.000Z',
            },
          ] as never
        }
        items={
          [
            {
              id: 'item-1',
              tenantId: 'tenant-1',
              sku: 'ONT-001',
              name: 'ONT WiFi 6',
            },
          ] as never
        }
      />,
    );

    expect(screen.getByText(/ONT WiFi 6 · ONT-001/)).toBeInTheDocument();
  });

  it('sin líneas ni ítems conserva el render anterior (compatibilidad hacia atrás)', () => {
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
      />,
    );

    expect(screen.getByText(/Cantidad 10/)).toBeInTheDocument();
    expect(screen.queryByText(/ONT/)).not.toBeInTheDocument();
  });

  it('la CTA salta a la matriz con la columna enfocada', async () => {
    const user = userEvent.setup();
    const onAwardQuote = jest.fn();

    render(
      <QuoteComparisonPanel
        quotes={[buildQuote()]}
        supplierLabels={{ 'party-1': 'Proveedor Alfa' }}
        onAwardQuote={onAwardQuote}
      />,
    );

    await user.click(
      screen.getByRole('button', {
        name: 'Adjudicar productos de la cotización de Proveedor Alfa',
      }),
    );
    expect(onAwardQuote).toHaveBeenCalledWith('quote-1');
  });

  it('muestra modificar cotización cuando el padre lo habilita', async () => {
    const user = userEvent.setup();
    const onEditQuote = jest.fn();

    render(
      <QuoteComparisonPanel
        quotes={[buildQuote()]}
        supplierLabels={{ 'party-1': 'Proveedor Alfa' }}
        onEditQuote={onEditQuote}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Modificar cotización de Proveedor Alfa' }),
    );
    expect(onEditQuote).toHaveBeenCalledWith('quote-1');
  });

  it('oculta modificar cotización si esa oferta ya está adjudicada', () => {
    render(
      <QuoteComparisonPanel
        quotes={[buildQuote()]}
        supplierLabels={{ 'party-1': 'Proveedor Alfa' }}
        onEditQuote={jest.fn()}
        canEditQuote={() => false}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Modificar cotización de Proveedor Alfa' }),
    ).not.toBeInTheDocument();
  });
});
