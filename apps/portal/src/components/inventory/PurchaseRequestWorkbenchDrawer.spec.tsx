import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  InventoryItemCategory,
  InventoryItemKind,
  PurchaseRequestLineSourceKind,
  PurchaseRequestLineStatus,
  PurchaseRequestStatus,
  PurchaseRequestType,
  PurchaseRfqStatus,
} from '@iwana/shared';
import type {
  InventoryCatalogOptionRecord,
  InventoryItemRecord,
  PurchaseRequestDetailRecord,
  PurchaseRfqDetailRecord,
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

function buildActiveRfqDetail(
  status: PurchaseRfqStatus = PurchaseRfqStatus.DRAFT,
): PurchaseRfqDetailRecord {
  return {
    rfq: {
      id: 'rfq-1',
      tenantId: 'tenant-1',
      purchaseRequestId: 'req-1',
      rfqNumber: 'RFQ-000001',
      status,
      currency: 'COP',
      responseDeadline: null,
      sentAt: null,
      closedAt: null,
      createdByUserId: 'user-1',
      notes: null,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    },
    invitations: [],
  };
}

function buildDetail(
  overrides: Partial<PurchaseRequestDetailRecord['request']> = {},
  extras: Partial<
    Pick<PurchaseRequestDetailRecord, 'lines' | 'awards' | 'orders' | 'quotes' | 'rfq'>
  > = {},
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
    rfq: extras.rfq ?? null,
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
    onSelectOrder: jest.fn().mockResolvedValue(undefined),
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
            shippingCost: '0',
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
    render(<PurchaseRequestWorkbenchDrawer {...buildProps(buildDetail())} />);

    await user.click(screen.getByRole('button', { name: /Editar líneas/i }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.getByRole('heading', { name: 'Descartar cambios' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Seguir editando' }));
    expect(screen.getByRole('button', { name: /Guardar cambios/i })).toBeInTheDocument();
  });
});

describe('PurchaseRequestWorkbenchDrawer — pestaña Cotizar', () => {
  it('CA-24-01: navegación primaria muestra 3 fases, no 7 tabs de primer nivel', () => {
    render(
      <PurchaseRequestWorkbenchDrawer
        {...buildProps(buildDetail({ status: PurchaseRequestStatus.DRAFT }))}
        activeTab="cotizar"
      />,
    );

    const phaseNav = screen.getByRole('navigation', { name: 'Fase del flujo' });
    expect(phaseNav).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preparar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Decidir' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abastecer' })).toBeDisabled();
    expect(screen.queryByRole('tab', { name: 'Recepciones' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Cotizar' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Aprobación' })).toBeInTheDocument();
  });

  it('muestra progressive disclosure y permite nueva cotización en DRAFT', () => {
    const props = {
      ...buildProps(buildDetail({ status: PurchaseRequestStatus.DRAFT })),
      activeTab: 'cotizar' as const,
    };

    render(<PurchaseRequestWorkbenchDrawer {...props} />);

    expect(screen.getByRole('tab', { name: 'Cotizar' })).toBeInTheDocument();
    // Primario = manual: ronda colapsada, nueva cotización expandida
    expect(screen.getByText('Ronda de cotización')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Nueva cotización' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar cotización' })).toBeInTheDocument();
  });

  it('oculta el bloque Ronda cuando no hay ronda ni se puede crear (PENDING_QUOTES)', () => {
    const props = {
      ...buildProps(buildDetail({ status: PurchaseRequestStatus.PENDING_QUOTES })),
      activeTab: 'cotizar' as const,
    };

    render(<PurchaseRequestWorkbenchDrawer {...props} />);

    expect(screen.queryByText('Ronda de cotización')).not.toBeInTheDocument();
    expect(screen.queryByText('Cotización sin ronda formal')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Crear solicitud de cotización' }),
    ).not.toBeInTheDocument();
  });

  it('CA-24-05: con ronda activa expande invitaciones y bloquea manual (C1)', () => {
    const props = {
      ...buildProps(
        buildDetail({ status: PurchaseRequestStatus.DRAFT }, { rfq: buildActiveRfqDetail() }),
      ),
      activeTab: 'cotizar' as const,
    };

    render(<PurchaseRequestWorkbenchDrawer {...props} />);

    expect(screen.getByRole('region', { name: 'Invitar proveedores' })).toBeInTheDocument();
    expect(screen.getByText('Cotización manual no disponible')).toBeInTheDocument();
    expect(screen.queryByLabelText('Monto')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registrar cotización' })).not.toBeInTheDocument();
  });

  it('mantiene el formulario de nueva cotización cuando la ronda está cerrada', () => {
    const props = {
      ...buildProps(
        buildDetail(
          { status: PurchaseRequestStatus.DRAFT },
          { rfq: buildActiveRfqDetail(PurchaseRfqStatus.CLOSED) },
        ),
      ),
      activeTab: 'cotizar' as const,
    };

    render(<PurchaseRequestWorkbenchDrawer {...props} />);

    expect(screen.queryByText('Cotización manual no disponible')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Nueva cotización' })).toBeInTheDocument();
    expect(screen.getByText(/Total de la cotización:/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar cotización' })).toBeInTheDocument();
  });

  it('CA-23-04: muestra CTA de siguiente acción fuera de su pestaña', async () => {
    const user = userEvent.setup();
    const onActiveTabChange = jest.fn();
    const props = {
      ...buildProps(buildDetail({ status: PurchaseRequestStatus.DRAFT })),
      activeTab: 'summary' as const,
      onActiveTabChange,
    };

    render(<PurchaseRequestWorkbenchDrawer {...props} />);

    const nextActionButtons = screen.getAllByRole('button', { name: /Ir a cotizar/i });
    expect(nextActionButtons.length).toBeGreaterThanOrEqual(1);
    await user.click(nextActionButtons[nextActionButtons.length - 1]!);
    expect(onActiveTabChange).toHaveBeenCalledWith('cotizar');
  });
});
