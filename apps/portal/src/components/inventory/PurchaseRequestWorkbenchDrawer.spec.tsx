import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  InventoryItemCategory,
  InventoryItemKind,
  PurchaseOrderStatus,
  PurchaseRequestLineSourceKind,
  PurchaseRequestLineStatus,
  PurchaseRequestStatus,
  PurchaseRequestType,
  PurchaseRfqStatus,
} from '@iwana/shared';
import type {
  InventoryCatalogOptionRecord,
  InventoryItemRecord,
  PurchaseOrderRecord,
  PurchaseRequestDetailRecord,
  PurchaseRfqDetailRecord,
  PurchaseTaxPresetRecord,
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
    Pick<
      PurchaseRequestDetailRecord,
      'lines' | 'awards' | 'orders' | 'quotes' | 'rfq' | 'purchaseTaxPresets'
    >
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
    ...(extras.purchaseTaxPresets ? { purchaseTaxPresets: extras.purchaseTaxPresets } : {}),
  };
}

function buildQuote(overrides: Partial<SupplierQuoteRecord> = {}): SupplierQuoteRecord {
  return {
    id: 'quote-1',
    tenantId: 'tenant-1',
    purchaseRequestId: 'req-1',
    partyRefId: 'supplier-1',
    quoteNumber: 'COT-1',
    amount: '1000',
    shippingCost: '0',
    currency: 'COP',
    validUntil: null,
    notes: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
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
    onUpdateQuote: jest.fn().mockResolvedValue(true),
    onApprove: jest.fn(),
    onCreateAwards: jest.fn(),
    onRevokeAward: jest.fn().mockResolvedValue(true),
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

  it('CA-28-01: en DRAFT sin ronda la Ronda nace expandida con Crear e invitar', () => {
    const props = {
      ...buildProps(buildDetail({ status: PurchaseRequestStatus.DRAFT })),
      activeTab: 'cotizar' as const,
    };

    render(<PurchaseRequestWorkbenchDrawer {...props} />);

    expect(screen.getByRole('tab', { name: 'Cotizar' })).toBeInTheDocument();
    // Primario = ronda: selector visible sin clic previo, manual colapsado
    expect(screen.getByRole('region', { name: 'Invitar proveedores' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear e invitar' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Nueva cotización' })).not.toBeInTheDocument();
    expect(screen.getByText('Ronda de cotización')).toBeInTheDocument();
  });

  it('CA-25-14: nueva cotización muestra tributos apagados y copy de no-factura', () => {
    const props = {
      ...buildProps(buildDetail({ status: PurchaseRequestStatus.DRAFT })),
      activeTab: 'cotizar' as const,
    };

    render(<PurchaseRequestWorkbenchDrawer {...props} />);

    // Fase 28: la ronda es el bloque primario y el manual nace colapsado,
    // pero montado con los mismos valores por defecto.
    expect(screen.queryByRole('region', { name: 'Nueva cotización' })).not.toBeInTheDocument();
    expect(screen.getByText('Nueva cotización')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'IVA', hidden: true })).not.toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'Retención en la fuente', hidden: true }),
    ).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Rete ICA', hidden: true })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Rete IVA', hidden: true })).not.toBeChecked();
    expect(screen.getByText(/No son una factura electrónica/i)).toBeInTheDocument();
    expect(screen.getByText(/No se guarda como perfil del proveedor/i)).toBeInTheDocument();
    expect(screen.queryByText('IVA_19')).not.toBeInTheDocument();
    expect(screen.getAllByText('Sin IVA').length).toBeGreaterThan(0);
  });

  it('CA-28-05: en PENDING_QUOTES sin ronda la sección Ronda existe y ofrece Crear e invitar', () => {
    const props = {
      ...buildProps(buildDetail({ status: PurchaseRequestStatus.PENDING_QUOTES })),
      activeTab: 'cotizar' as const,
    };

    render(<PurchaseRequestWorkbenchDrawer {...props} />);

    expect(screen.getByRole('region', { name: 'Invitar proveedores' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear e invitar' })).toBeInTheDocument();
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

  it('permite modificar una cotización manual en PENDING_APPROVAL', async () => {
    const user = userEvent.setup();
    const onUpdateQuote = jest.fn().mockResolvedValue(true);
    const quote: SupplierQuoteRecord = {
      id: 'quote-1',
      tenantId: 'tenant-1',
      purchaseRequestId: 'req-1',
      partyRefId: 'party-1',
      quoteNumber: 'COT-100',
      amount: '15000',
      shippingCost: '0',
      shippingArrangement: 'ON_INVOICE',
      currency: 'COP',
      validUntil: null,
      notes: null,
      rfqId: null,
      rfqInvitationId: null,
      lines: [
        {
          id: 'ql-1',
          tenantId: 'tenant-1',
          supplierQuoteId: 'quote-1',
          purchaseRequestLineId: 'line-1',
          quantity: '10',
          unitCost: '1500',
          lineAmount: '15000',
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        },
      ],
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    };

    render(
      <PurchaseRequestWorkbenchDrawer
        {...buildProps(
          buildDetail({ status: PurchaseRequestStatus.PENDING_APPROVAL }, { quotes: [quote] }),
        )}
        supplierLabels={{ 'party-1': 'Proveedor Alfa' }}
        onUpdateQuote={onUpdateQuote}
        activeTab="cotizar"
      />,
    );

    expect(screen.queryByRole('button', { name: 'Registrar cotización' })).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Modificar cotización de Proveedor Alfa' }),
    );

    expect(screen.getByRole('region', { name: 'Modificar cotización' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('COT-100')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(onUpdateQuote).toHaveBeenCalledWith(
      'quote-1',
      expect.objectContaining({
        quoteNumber: 'COT-100',
        lines: [{ purchaseRequestLineId: 'line-1', unitCost: 1500 }],
      }),
    );
  });
});

describe('PurchaseRequestWorkbenchDrawer — regresiones Fase 28 (auditoría)', () => {
  function buildOrder(overrides: Partial<PurchaseOrderRecord> = {}): PurchaseOrderRecord {
    return {
      id: 'order-1',
      tenantId: 'tenant-1',
      orderNumber: 'OC-001',
      purchaseRequestId: 'req-1',
      partyRefId: 'supplier-1',
      status: PurchaseOrderStatus.APPROVED,
      expectedDeliveryDate: null,
      approvedByUserId: null,
      cancellationReason: null,
      cancelledByUserId: null,
      closedByUserId: null,
      notes: null,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
      ...overrides,
    };
  }

  it('A4 · CA-28-06: en PENDING_QUOTES con cotizaciones y sin ronda, la comparación nace expandida', () => {
    const detail = buildDetail(
      { status: PurchaseRequestStatus.PENDING_QUOTES },
      {
        quotes: [
          buildQuote({ id: 'quote-1', quoteNumber: 'COT-1', amount: '1000' }),
          buildQuote({ id: 'quote-2', quoteNumber: 'COT-2', amount: '1200' }),
        ],
      },
    );

    render(<PurchaseRequestWorkbenchDrawer {...buildProps(detail)} activeTab="cotizar" />);

    // Sección expandida = <section role="region">; colapsada = <details> con <div>.
    expect(screen.getByRole('region', { name: 'Cotizaciones' })).toBeInTheDocument();
    // La ronda existe pero queda replegada dentro de su <details>.
    expect(screen.queryByRole('region', { name: 'Invitar proveedores' })).not.toBeInTheDocument();
    const rondaSummary = Array.from(document.querySelectorAll('summary')).find((element) =>
      (element.textContent ?? '').includes('Ronda de cotización'),
    );
    expect(rondaSummary).toBeDefined();
    expect(rondaSummary?.closest('details')).not.toHaveAttribute('open');
  });

  it('C1: el error de cancelación de orden sigue visible tras cerrarse el formulario', () => {
    const detail = buildDetail(
      { status: PurchaseRequestStatus.APPROVED },
      { orders: [buildOrder()] },
    );

    render(
      <PurchaseRequestWorkbenchDrawer
        {...buildProps(detail)}
        activeTab="orders"
        cancelOrderError="La orden ya fue recibida parcialmente."
      />,
    );

    // El formulario de motivo está cerrado (cancelOrderMode === null).
    expect(screen.queryByLabelText('Motivo de cancelación de la orden')).not.toBeInTheDocument();
    expect(screen.getByText('No se pudo cancelar la orden')).toBeInTheDocument();
    expect(screen.getByText('La orden ya fue recibida parcialmente.')).toBeInTheDocument();
  });

  it('C2: tras rechazar, el formulario de resolución desaparece en estado terminal', async () => {
    const user = userEvent.setup();
    const onReject = jest.fn().mockResolvedValue(undefined);
    const props = {
      ...buildProps(buildDetail({ status: PurchaseRequestStatus.PENDING_QUOTES })),
      activeTab: 'summary' as const,
      onReject,
    };

    const { rerender } = render(<PurchaseRequestWorkbenchDrawer {...props} />);

    await user.click(screen.getByRole('button', { name: 'Rechazar' }));
    await user.type(
      screen.getByLabelText('Motivo del rechazo'),
      'Presupuesto no disponible este trimestre',
    );
    await user.click(screen.getByRole('button', { name: 'Confirmar rechazo' }));

    expect(onReject).toHaveBeenCalledTimes(1);

    // El backend ya movió la solicitud a estado terminal.
    rerender(
      <PurchaseRequestWorkbenchDrawer
        {...props}
        detail={buildDetail({ status: PurchaseRequestStatus.REJECTED })}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Confirmar rechazo' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Motivo del rechazo')).not.toBeInTheDocument();
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('A1: aplica la tasa del preset del tenant cuando los presets llegan tras el montaje', async () => {
    const user = userEvent.setup();
    const presets: PurchaseTaxPresetRecord[] = [
      {
        code: 'RETE_ICA',
        name: 'Rete ICA',
        category: 'WITHHOLDING',
        baseRate: 0.966,
        treatment: 'WITHHOLD',
        context: 'PURCHASE',
      },
    ];

    // El drawer se monta con detail === null (PurchaseWorkspace lo monta siempre).
    const baseProps = {
      ...buildProps(buildDetail({ status: PurchaseRequestStatus.DRAFT })),
      activeTab: 'cotizar' as const,
    };

    const { rerender } = render(<PurchaseRequestWorkbenchDrawer {...baseProps} detail={null} />);

    rerender(
      <PurchaseRequestWorkbenchDrawer
        {...baseProps}
        detail={buildDetail(
          { status: PurchaseRequestStatus.DRAFT },
          { purchaseTaxPresets: presets },
        )}
      />,
    );

    await user.click(screen.getByRole('checkbox', { name: 'Rete ICA', hidden: true }));

    expect(
      screen.getByRole('spinbutton', { name: 'Tasa de Rete ICA (%)', hidden: true }),
    ).toHaveValue(0.966);
  });

  it('A1: no pisa la tasa que el operador ya editó cuando llegan los presets', async () => {
    const user = userEvent.setup();
    const presets: PurchaseTaxPresetRecord[] = [
      {
        code: 'RETE_ICA',
        name: 'Rete ICA',
        category: 'WITHHOLDING',
        baseRate: 0.966,
        treatment: 'WITHHOLD',
        context: 'PURCHASE',
      },
    ];
    const baseProps = {
      ...buildProps(buildDetail({ status: PurchaseRequestStatus.DRAFT })),
      activeTab: 'cotizar' as const,
    };

    const { rerender } = render(<PurchaseRequestWorkbenchDrawer {...baseProps} />);

    await user.click(screen.getByRole('checkbox', { name: 'Rete ICA', hidden: true }));

    rerender(
      <PurchaseRequestWorkbenchDrawer
        {...baseProps}
        detail={buildDetail(
          { status: PurchaseRequestStatus.DRAFT },
          { purchaseTaxPresets: presets },
        )}
      />,
    );

    // La fila ya estaba marcada por el operador: se respeta su estado.
    expect(screen.getByRole('checkbox', { name: 'Rete ICA', hidden: true })).toBeChecked();
    expect(
      screen.getByRole('spinbutton', { name: 'Tasa de Rete ICA (%)', hidden: true }),
    ).toHaveValue(0.414);
  });
});

describe('PurchaseRequestWorkbenchDrawer — adjudicación FE-3', () => {
  const STAMP = '2026-06-01T00:00:00.000Z';

  function buildAwardableDetail(): PurchaseRequestDetailRecord {
    return buildDetail(
      { status: PurchaseRequestStatus.APPROVED },
      {
        lines: [
          {
            id: 'line-1',
            tenantId: 'tenant-1',
            purchaseRequestId: 'req-1',
            sourceKind: PurchaseRequestLineSourceKind.INVENTORY_ITEM,
            inventoryItemId: 'item-active',
            freeTextDescription: null,
            quantityRequested: '2',
            unitOfMeasure: 'unidad',
            suggestedPartyRefId: null,
            lineStatus: PurchaseRequestLineStatus.OPEN,
            notes: null,
            createdAt: STAMP,
            updatedAt: STAMP,
          },
        ],
        quotes: [
          {
            ...buildQuote({ id: 'quote-1', partyRefId: 'supplier-1' }),
            lines: [
              {
                id: 'ql-1',
                tenantId: 'tenant-1',
                supplierQuoteId: 'quote-1',
                purchaseRequestLineId: 'line-1',
                quantity: '2',
                unitCost: '5000',
                lineAmount: '10000',
                createdAt: STAMP,
                updatedAt: STAMP,
              },
            ],
          },
        ],
      },
    );
  }

  it('el tab Adjudicación renderiza la matriz (no el panel anterior)', () => {
    render(
      <PurchaseRequestWorkbenchDrawer {...buildProps(buildAwardableDetail())} activeTab="awards" />,
    );

    expect(screen.getByText('Adjudicar productos a proveedores')).toBeInTheDocument();
    expect(screen.queryByText('Asignar proveedores por línea')).not.toBeInTheDocument();
  });

  it('el tab Adjudicación muestra carga cuando el detalle aún no llega', () => {
    const props = { ...buildProps(buildAwardableDetail()), activeTab: 'awards' as const };
    render(<PurchaseRequestWorkbenchDrawer {...props} detail={null} isLoading />);

    // El diálogo vive en un portal fuera del contenedor de render.
    expect(document.body.querySelector('[aria-hidden="true"].animate-pulse')).toBeTruthy();
    expect(screen.queryByText('Adjudicar productos a proveedores')).not.toBeInTheDocument();
  });

  it('«Adjudicar y continuar» emite el draft del contrato y abre el flujo de órdenes', async () => {
    const user = userEvent.setup();
    const onCreateAwards = jest.fn().mockResolvedValue(undefined);
    const onOpenOrderFlow = jest.fn();
    render(
      <PurchaseRequestWorkbenchDrawer
        {...buildProps(buildAwardableDetail())}
        activeTab="awards"
        onCreateAwards={onCreateAwards}
        onOpenOrderFlow={onOpenOrderFlow}
      />,
    );

    await user.click(
      screen.getByRole('radio', { name: 'Adjudicar Sin nombre a Proveedor no identificado' }),
    );
    await user.click(screen.getByRole('button', { name: 'Adjudicar y continuar' }));

    expect(onCreateAwards).toHaveBeenCalledWith([
      expect.objectContaining({
        purchaseRequestLineId: 'line-1',
        supplierQuoteId: 'quote-1',
        awardedPartyRefId: 'supplier-1',
        awardedQuantity: '2.00',
      }),
    ]);
    expect(onOpenOrderFlow).toHaveBeenCalledTimes(1);
  });

  it('«Guardar adjudicación» persiste sin abrir el flujo de órdenes', async () => {
    const user = userEvent.setup();
    const onCreateAwards = jest.fn().mockResolvedValue(undefined);
    const onOpenOrderFlow = jest.fn();
    render(
      <PurchaseRequestWorkbenchDrawer
        {...buildProps(buildAwardableDetail())}
        activeTab="awards"
        onCreateAwards={onCreateAwards}
        onOpenOrderFlow={onOpenOrderFlow}
      />,
    );

    await user.click(
      screen.getByRole('radio', { name: 'Adjudicar Sin nombre a Proveedor no identificado' }),
    );
    await user.click(screen.getByRole('button', { name: 'Guardar adjudicación' }));

    expect(onCreateAwards).toHaveBeenCalledTimes(1);
    expect(onOpenOrderFlow).not.toHaveBeenCalled();
  });

  it('«Sin cotizaciones» ofrece ir al tab Cotizar', async () => {
    const user = userEvent.setup();
    const onActiveTabChange = jest.fn();
    const detail = buildDetail({ status: PurchaseRequestStatus.APPROVED });
    render(
      <PurchaseRequestWorkbenchDrawer
        {...buildProps(detail)}
        activeTab="awards"
        onActiveTabChange={onActiveTabChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Ir a cotizar' }));
    expect(onActiveTabChange).toHaveBeenCalledWith('cotizar');
  });

  it('la comparación salta a la matriz con la columna enfocada', async () => {
    const user = userEvent.setup();
    const onActiveTabChange = jest.fn();
    const detail = buildDetail(
      { status: PurchaseRequestStatus.APPROVED },
      { quotes: [buildQuote()] },
    );
    render(
      <PurchaseRequestWorkbenchDrawer
        {...buildProps(detail)}
        activeTab="cotizar"
        onActiveTabChange={onActiveTabChange}
      />,
    );

    await user.click(
      screen.getByRole('button', {
        name: 'Adjudicar productos de la cotización de Proveedor no identificado',
      }),
    );
    expect(onActiveTabChange).toHaveBeenCalledWith('awards');
  });
});
