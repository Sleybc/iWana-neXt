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
});
