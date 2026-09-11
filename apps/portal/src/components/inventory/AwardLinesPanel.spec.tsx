import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  PartyStatus,
  PurchaseRequestLineSourceKind,
  PurchaseRequestLineStatus,
  PurchaseRequestPriority,
  PurchaseRequestStatus,
  PurchaseRequestType,
} from '@iwana/shared';
import type { PurchaseRequestDetailRecord } from '@/lib/api-client';
import { purchasingApi } from '@/lib/api-client';
import { AwardLinesPanel } from './AwardLinesPanel';

jest.mock('@/lib/api-client', () => ({
  purchasingApi: {
    searchSuppliers: jest.fn(),
  },
}));

const purchasingApiMock = purchasingApi as jest.Mocked<typeof purchasingApi>;

const items = [
  {
    id: 'item-1',
    tenantId: 'tenant-1',
    sku: 'ONT-001',
    name: 'ONT WiFi 6',
    category: 'CPE',
    trackingMode: 'SERIALIZED',
    unitOfMeasure: 'unidad',
    baseCost: '120000',
    minimumStock: '2',
    usefulLifeMonths: 36,
    status: 'ACTIVE',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  },
] as never;

function buildDetail(
  overrides: Partial<PurchaseRequestDetailRecord> = {},
): PurchaseRequestDetailRecord {
  return {
    request: {
      id: 'req-1',
      tenantId: 'tenant-1',
      requestNumber: 'SC-001',
      title: 'Reposición',
      status: PurchaseRequestStatus.APPROVED,
      requestType: PurchaseRequestType.REPLENISHMENT,
      priority: PurchaseRequestPriority.NORMAL,
      requestedByUserId: 'user-1',
      requestingArea: 'Operaciones',
      justification: null,
      operationalRefType: null,
      operationalRefId: null,
      exceptionReason: null,
      approvedByUserId: 'user-1',
      neededByDate: null,
      notes: null,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
      ...overrides.request,
    },
    lines: overrides.lines ?? [
      {
        id: 'line-1',
        tenantId: 'tenant-1',
        purchaseRequestId: 'req-1',
        sourceKind: PurchaseRequestLineSourceKind.INVENTORY_ITEM,
        inventoryItemId: 'item-1',
        freeTextDescription: null,
        quantityRequested: '10',
        unitOfMeasure: 'unidad',
        suggestedPartyRefId: null,
        lineStatus: PurchaseRequestLineStatus.OPEN,
        notes: null,
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
    ],
    quotes: overrides.quotes ?? [
      {
        id: 'quote-1',
        tenantId: 'tenant-1',
        purchaseRequestId: 'req-1',
        partyRefId: 'supplier-1',
        quoteNumber: 'COT-001',
        amount: '1500000',
        shippingCost: '0',
        currency: 'COP',
        validUntil: null,
        notes: null,
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
    ],
    awards: overrides.awards ?? [],
    orders: [],
    estimatedAmount: 1500000,
    approvalPolicy: {
      canApprove: false,
      requiresException: false,
      blockingReason: null,
      approvalLevel: 'MANAGER',
    },
    rfq: null,
    ...overrides,
  };
}

describe('AwardLinesPanel', () => {
  beforeEach(() => {
    purchasingApiMock.searchSuppliers.mockResolvedValue({
      data: [
        {
          partyRefId: 'supplier-1',
          displayName: 'Proveedor Alfa',
          status: PartyStatus.ACTIVE,
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    });
  });

  it('bloquea la cantidad fuera de solicitudes de proyecto', () => {
    render(<AwardLinesPanel detail={buildDetail()} items={items} onDraftsChange={jest.fn()} />);

    expect(screen.getByLabelText('Cantidad adjudicada')).toBeDisabled();
    expect(screen.getByLabelText('Cantidad adjudicada')).toHaveValue(10);
  });

  it('permite cantidad editable en solicitudes de proyecto', () => {
    render(
      <AwardLinesPanel
        detail={buildDetail({
          request: {
            ...buildDetail().request,
            requestType: PurchaseRequestType.PROJECT,
          },
        })}
        items={items}
        onDraftsChange={jest.fn()}
      />,
    );

    expect(screen.getByLabelText('Cantidad adjudicada')).not.toBeDisabled();
  });

  it('emite drafts válidos al seleccionar proveedor sugerido desde cotización', async () => {
    const onDraftsChange = jest.fn();

    render(
      <AwardLinesPanel
        detail={buildDetail()}
        items={items}
        supplierLabels={{ 'supplier-1': 'Proveedor Alfa' }}
        onDraftsChange={onDraftsChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Usar COT-001/i }));

    await waitFor(() => {
      expect(onDraftsChange).toHaveBeenCalledWith([
        expect.objectContaining({
          purchaseRequestLineId: 'line-1',
          awardedPartyRefId: 'supplier-1',
          awardedQuantity: 10,
          supplierQuoteId: 'quote-1',
        }),
      ]);
    });
  });

  it('muestra adjudicaciones existentes sin formulario editable', () => {
    render(
      <AwardLinesPanel
        detail={buildDetail({
          awards: [
            {
              id: 'award-1',
              tenantId: 'tenant-1',
              purchaseRequestLineId: 'line-1',
              supplierQuoteId: 'quote-1',
              awardedPartyRefId: 'supplier-1',
              awardedQuantity: '10',
              awardNotes: null,
              createdAt: '2026-06-01T00:00:00.000Z',
              updatedAt: '2026-06-01T00:00:00.000Z',
            },
          ],
          lines: [
            {
              id: 'line-1',
              tenantId: 'tenant-1',
              purchaseRequestId: 'req-1',
              sourceKind: PurchaseRequestLineSourceKind.INVENTORY_ITEM,
              inventoryItemId: 'item-1',
              freeTextDescription: null,
              quantityRequested: '10',
              unitOfMeasure: 'unidad',
              suggestedPartyRefId: null,
              lineStatus: PurchaseRequestLineStatus.AWARDED,
              notes: null,
              createdAt: '2026-06-01T00:00:00.000Z',
              updatedAt: '2026-06-01T00:00:00.000Z',
            },
          ],
        })}
        items={items}
        supplierLabels={{ 'supplier-1': 'Proveedor Alfa' }}
      />,
    );

    expect(screen.getByText(/Proveedor Alfa · 10 unidad/i)).toBeInTheDocument();
    expect(screen.getByText('Esta línea ya está adjudicada por completo.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Cantidad adjudicada')).not.toBeInTheDocument();
  });

  it('ordena las cotizaciones de más barata a más cara por línea', () => {
    const detail = buildDetail({
      quotes: [
        {
          id: 'quote-cara',
          tenantId: 'tenant-1',
          purchaseRequestId: 'req-1',
          partyRefId: 'supplier-1',
          quoteNumber: 'COT-001',
          amount: '29000',
          shippingCost: '0',
          currency: 'COP',
          validUntil: null,
          notes: null,
          lines: [
            {
              id: 'ql-1',
              tenantId: 'tenant-1',
              supplierQuoteId: 'quote-cara',
              purchaseRequestLineId: 'line-1',
              quantity: '10',
              unitCost: '2900',
              lineAmount: '29000',
              createdAt: '2026-06-01T00:00:00.000Z',
              updatedAt: '2026-06-01T00:00:00.000Z',
            },
          ],
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        },
        {
          id: 'quote-barata',
          tenantId: 'tenant-1',
          purchaseRequestId: 'req-1',
          partyRefId: 'supplier-2',
          quoteNumber: 'COT-002',
          amount: '26280',
          shippingCost: '0',
          currency: 'COP',
          validUntil: null,
          notes: null,
          lines: [
            {
              id: 'ql-2',
              tenantId: 'tenant-1',
              supplierQuoteId: 'quote-barata',
              purchaseRequestLineId: 'line-1',
              quantity: '10',
              unitCost: '2628.10',
              lineAmount: '26281',
              createdAt: '2026-06-01T00:00:00.000Z',
              updatedAt: '2026-06-01T00:00:00.000Z',
            },
          ],
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        },
      ],
    });

    render(<AwardLinesPanel detail={detail} items={items} onDraftsChange={jest.fn()} />);

    const usarButtons = screen.getAllByRole('button', { name: /Usar COT-/i });
    expect(usarButtons).toHaveLength(2);
    expect(usarButtons[0]).toHaveTextContent(/COT-002/);
    expect(usarButtons[0]).toHaveTextContent(/Más barato/);
    expect(usarButtons[1]).toHaveTextContent(/COT-001/);
    for (const button of usarButtons) {
      expect(button.textContent ?? '').not.toMatch(/, · ,/);
    }
  });

  it('no marca «más barata» ni ordena por precio cuando las cotizaciones están en monedas distintas', () => {
    // Sin tasa de cambio en el módulo, comparar 50 USD contra 200.000 COP por su valor
    // numérico induciría una recomendación falsa: 50 < 200000 no significa más barato.
    const detail = buildDetail({
      quotes: [
        {
          id: 'quote-cop',
          tenantId: 'tenant-1',
          purchaseRequestId: 'req-1',
          partyRefId: 'supplier-1',
          quoteNumber: 'COT-COP',
          amount: '200000',
          shippingCost: '0',
          currency: 'COP',
          validUntil: null,
          notes: null,
          lines: [
            {
              id: 'ql-cop',
              tenantId: 'tenant-1',
              supplierQuoteId: 'quote-cop',
              purchaseRequestLineId: 'line-1',
              quantity: '10',
              unitCost: '20000',
              lineAmount: '200000',
              createdAt: '2026-06-01T00:00:00.000Z',
              updatedAt: '2026-06-01T00:00:00.000Z',
            },
          ],
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        },
        {
          id: 'quote-usd',
          tenantId: 'tenant-1',
          purchaseRequestId: 'req-1',
          partyRefId: 'supplier-2',
          quoteNumber: 'COT-USD',
          amount: '50',
          shippingCost: '0',
          currency: 'USD',
          validUntil: null,
          notes: null,
          lines: [
            {
              id: 'ql-usd',
              tenantId: 'tenant-1',
              supplierQuoteId: 'quote-usd',
              purchaseRequestLineId: 'line-1',
              quantity: '10',
              unitCost: '5',
              lineAmount: '50',
              createdAt: '2026-06-01T00:00:00.000Z',
              updatedAt: '2026-06-01T00:00:00.000Z',
            },
          ],
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        },
      ],
    });

    render(<AwardLinesPanel detail={detail} items={items} onDraftsChange={jest.fn()} />);

    const usarButtons = screen.getAllByRole('button', { name: /Usar COT-/i });
    expect(usarButtons).toHaveLength(2);
    // Ninguna se marca «más barata»: la numérica USD (5/u.) es menor que la COP
    // (20.000/u.) sin que eso implique nada sobre el costo real.
    for (const button of usarButtons) {
      expect(button.textContent ?? '').not.toMatch(/Más barato/);
    }
    // El orden original se conserva (no se reordena sin base de comparación común).
    expect(usarButtons[0]).toHaveTextContent(/COT-COP/);
    expect(usarButtons[1]).toHaveTextContent(/COT-USD/);
    // El código de moneda queda visible junto al importe de cada oferta.
    expect(usarButtons[0]).toHaveTextContent(/COP/);
    expect(usarButtons[1]).toHaveTextContent(/USD/);
  });

  it('cada producto es replegable con botón accesible', () => {
    render(<AwardLinesPanel detail={buildDetail()} items={items} onDraftsChange={jest.fn()} />);

    const header = screen.getByRole('button', { name: /ONT-001/i });
    expect(header).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Cantidad adjudicada')).toBeVisible();

    fireEvent.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByLabelText('Cantidad adjudicada')).not.toBeVisible();

    fireEvent.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Cantidad adjudicada')).toBeVisible();
  });

  it('la cotización vinculada muestra etiqueta limpia sin comas espurias', () => {
    const detail = buildDetail({
      quotes: [
        {
          id: 'quote-1',
          tenantId: 'tenant-1',
          purchaseRequestId: 'req-1',
          partyRefId: 'supplier-1',
          quoteNumber: '25987',
          amount: '168067.23',
          shippingCost: '0',
          currency: 'COP',
          validUntil: null,
          notes: null,
          lines: [
            {
              id: 'ql-1',
              tenantId: 'tenant-1',
              supplierQuoteId: 'quote-1',
              purchaseRequestLineId: 'line-1',
              quantity: '20',
              unitCost: '168067.23',
              lineAmount: '3361344.60',
              createdAt: '2026-06-01T00:00:00.000Z',
              updatedAt: '2026-06-01T00:00:00.000Z',
            },
          ],
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        },
      ],
    });

    render(
      <AwardLinesPanel
        detail={detail}
        items={items}
        supplierLabels={{ 'supplier-1': 'Proveedor Alfa' }}
        onDraftsChange={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Usar 25987/i }));

    const trigger = screen.getByRole('combobox', { name: /Cotización vinculada/i });
    expect(trigger.textContent ?? '').not.toMatch(/, · ,/);
    expect(trigger.textContent ?? '').toMatch(/25987 · /);
  });
});
