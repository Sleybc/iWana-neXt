import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  InventoryItemCategory,
  InventoryItemKind,
  PurchaseRequestLineSourceKind,
  PurchaseRequestLineStatus,
  PurchaseRequestStatus,
  PurchaseRequestType,
} from '@iwana/shared';
import type {
  InventoryCatalogOptionRecord,
  InventoryItemRecord,
  PurchaseRequestDetailRecord,
  SupplierQuoteRecord,
} from '@/lib/api-client';
import { PurchaseRequestWorkbenchDrawer } from './PurchaseRequestWorkbenchDrawer';

const catalogOptions: InventoryCatalogOptionRecord[] = [
  {
    id: 'item-active',
    sku: 'ONT-001',
    name: 'ONT WiFi 6',
    categoryId: 'cat-cpe',
    categoryName: 'CPE',
    categoryCode: 'CPE',
    category: InventoryItemCategory.CPE,
    itemKind: InventoryItemKind.SERIALIZED,
    unitOfMeasure: 'unidad',
    purchaseUnitOfMeasure: 'caja',
    standardCost: '120000',
    preferredSupplierRefId: 'supplier-1',
    preferredSupplierName: 'Proveedor Alfa',
    supplierSku: 'SUP-ONT',
  },
];

const items: InventoryItemRecord[] = [];

function buildDetail(
  overrides: Partial<PurchaseRequestDetailRecord['request']> = {},
  extras: Partial<Pick<PurchaseRequestDetailRecord, 'lines' | 'awards' | 'orders' | 'quotes'>> = {},
): PurchaseRequestDetailRecord {
  return {
    request: {
      id: 'req-1',
      tenantId: 'tenant-1',
      requestNumber: 'SC-001',
      title: 'Reposición',
      status: PurchaseRequestStatus.DRAFT,
      requestType: PurchaseRequestType.REPLENISHMENT,
      priority: 'NORMAL' as PurchaseRequestDetailRecord['request']['priority'],
      requestedByUserId: 'user-1',
      requestingArea: 'Operaciones',
      justification: null,
      operationalRefType: null,
      operationalRefId: null,
      exceptionReason: null,
      approvedByUserId: null,
      neededByDate: null,
      notes: null,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
      ...overrides,
    },
    lines: extras.lines ?? [
      {
        id: 'line-1',
        tenantId: 'tenant-1',
        purchaseRequestId: 'req-1',
        sourceKind: PurchaseRequestLineSourceKind.FREE_TEXT,
        inventoryItemId: null,
        freeTextDescription: 'Cable UTP',
        quantityRequested: '10',
        unitOfMeasure: 'metro',
        suggestedPartyRefId: null,
        lineStatus: PurchaseRequestLineStatus.OPEN,
        notes: null,
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
    ],
    quotes: extras.quotes ?? [],
    awards: extras.awards ?? [],
    orders: extras.orders ?? [],
    estimatedAmount: 0,
    approvalPolicy: {
      canApprove: false,
      requiresException: false,
      blockingReason: null,
      approvalLevel: 'MANAGER',
    },
    rfq: null,
  };
}

function buildProps(detail: PurchaseRequestDetailRecord) {
  return {
    open: true,
    detail,
    items,
    catalogOptions,
    isSubmittingUpdateLines: false,
    updateLinesError: null,
    onUpdateLines: jest.fn().mockResolvedValue({ ok: true }),
    locations: [],
    latestOrder: null,
    latestOrderLines: [],
    latestReceipt: null,
    activeTab: 'lines' as const,
    onActiveTabChange: jest.fn(),
    isLoading: false,
    error: null,
    supplierSummary: null,
    supplierLoading: false,
    supplierError: null,
    isSubmittingQuote: false,
    isSubmittingApprove: false,
    isSubmittingAwards: false,
    isSubmittingReject: false,
    isSubmittingCancel: false,
    isSubmittingReceipt: false,
    isSubmittingApproveOrder: false,
    isSubmittingCancelOrder: false,
    isSubmittingCloseOrder: false,
    quoteError: null,
    approveError: null,
    awardsError: null,
    rejectError: null,
    cancelError: null,
    receiptError: null,
    approveOrderError: null,
    cancelOrderError: null,
    closeOrderError: null,
    onClose: jest.fn(),
    onAddQuote: jest.fn(),
    onApprove: jest.fn(),
    onCreateAwards: jest.fn(),
    onReject: jest.fn(),
    onCancel: jest.fn(),
    onLoadSupplier: jest.fn(),
    onOpenOrderFlow: jest.fn(),
    onReceiveOrder: jest.fn(),
    onRefreshDetail: jest.fn().mockResolvedValue(undefined),
    onEditRequest: jest.fn(),
    onApproveOrder: jest.fn(),
    onCancelOrder: jest.fn(),
    onCloseOrder: jest.fn(),
  };
}

describe('PurchaseRequestWorkbenchDrawer — edición inline de líneas', () => {
  it('muestra el botón "Editar líneas" cuando la solicitud es editable', () => {
    render(<PurchaseRequestWorkbenchDrawer {...buildProps(buildDetail())} />);

    expect(screen.getByRole('button', { name: /Editar líneas/i })).toBeInTheDocument();
  });

  it('oculta "Editar líneas" cuando la solicitud ya tiene cotizaciones', () => {
    const detail = buildDetail(
      { status: PurchaseRequestStatus.PENDING_QUOTES },
      {
        quotes: [
          {
            id: 'quote-1',
            tenantId: 'tenant-1',
            purchaseRequestId: 'req-1',
            partyRefId: 'supplier-1',
            quoteNumber: 'Q-1',
            amount: '1000',
            currency: 'COP',
            validUntil: null,
            notes: null,
            createdAt: '2026-06-01T00:00:00.000Z',
            updatedAt: '2026-06-01T00:00:00.000Z',
          } satisfies SupplierQuoteRecord,
        ],
      },
    );

    render(<PurchaseRequestWorkbenchDrawer {...buildProps(detail)} />);

    expect(screen.queryByRole('button', { name: /Editar líneas/i })).not.toBeInTheDocument();
  });

  it('permite entrar en modo edición, agregar una línea de catálogo y guardar sin cerrar el modal', async () => {
    const user = userEvent.setup();
    const onUpdateLines = jest.fn().mockResolvedValue({ ok: true });
    const props = { ...buildProps(buildDetail()), onUpdateLines };

    render(<PurchaseRequestWorkbenchDrawer {...props} />);

    await user.click(screen.getByRole('button', { name: /Editar líneas/i }));

    expect(screen.getByText(/Editar líneas/i)).toBeInTheDocument();

    const searchInput = screen.getByRole('combobox', { name: /Buscar producto/i });
    await user.type(searchInput, 'ONT');
    await user.click(await screen.findByRole('option', { name: /ONT-001 - ONT WiFi 6/i }));

    await user.click(screen.getByRole('button', { name: /Guardar cambios/i }));

    expect(onUpdateLines).toHaveBeenCalledTimes(1);
    const payload = onUpdateLines.mock.calls[0][0] as { lines: unknown[] };
    expect(payload.lines).toHaveLength(2);
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('pide confirmación al cancelar si hay cambios sin guardar', async () => {
    const user = userEvent.setup();
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
    render(<PurchaseRequestWorkbenchDrawer {...buildProps(buildDetail())} />);

    await user.click(screen.getByRole('button', { name: /Editar líneas/i }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Guardar cambios/i })).toBeInTheDocument();

    confirmSpy.mockRestore();
  });
});
