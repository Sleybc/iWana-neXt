import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  GoodsReceiptStatus,
  InventoryItemCategory,
  InventoryCategoryStatus,
  InventoryItemKind,
  InventoryItemStatus,
  InventoryTrackingMode,
  PartyStatus,
  PurchaseOrderStatus,
  PurchaseRequestPriority,
  PurchaseRequestStatus,
  PurchaseRequestType,
  StockBalanceCondition,
  StockLocationStatus,
  StockLocationType,
  StockMovementOrigin,
} from '@iwana/shared';
import { inventoryApi, purchasingApi, type InventoryItemRecord } from '@/lib/api-client';
import { InventoryClient } from './InventoryClient';
import {
  formatInventoryCurrency,
  getInventoryItemCategoryLabel,
  getPurchaseRequestStatusLabel,
} from './inventory-labels';

jest.mock('@/lib/api-client', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  inventoryApi: {
    dashboard: jest.fn(),
    listItems: jest.fn(),
    getItem: jest.fn(),
    createItem: jest.fn(),
    updateItem: jest.fn(),
    listCatalogOptions: jest.fn(),
    listCategories: jest.fn(),
    getCategory: jest.fn(),
    createCategory: jest.fn(),
    updateCategory: jest.fn(),
    listLocations: jest.fn(),
    listAssets: jest.fn(),
    listBalances: jest.fn(),
    getAsset: jest.fn(),
    transfer: jest.fn(),
    sale: jest.fn(),
    registerReturn: jest.fn(),
    writeOff: jest.fn(),
  },
  purchasingApi: {
    listRequests: jest.fn(),
    getRequestDetail: jest.fn(),
    createRequest: jest.fn(),
    addQuote: jest.fn(),
    approveRequest: jest.fn(),
    createAwards: jest.fn(),
    getProviderSummary: jest.fn(),
    searchSuppliers: jest.fn(),
    createOrder: jest.fn(),
    listOrders: jest.fn(),
    getOrder: jest.fn(),
    receiveOrder: jest.fn(),
  },
}));

const inventoryApiMock = inventoryApi as jest.Mocked<typeof inventoryApi>;
const purchasingApiMock = purchasingApi as jest.Mocked<typeof purchasingApi>;

function buildCatalogItem(overrides: Partial<InventoryItemRecord> = {}): InventoryItemRecord {
  return {
    id: 'item-1',
    tenantId: 'tenant-1',
    sku: 'ONT-001',
    name: 'ONT WiFi 6',
    description: 'Terminal óptica de campo',
    brand: 'FiberCo',
    model: 'XGS-6',
    itemKind: InventoryItemKind.SERIALIZED,
    category: InventoryItemCategory.CPE,
    categoryId: 'cat-cpe',
    categoryName: 'CPE',
    categoryCode: 'CPE',
    trackingMode: InventoryTrackingMode.SERIALIZED,
    unitOfMeasure: 'unidad',
    baseCost: '120000',
    minimumStock: '2',
    purchasable: true,
    inventoryControlled: true,
    assetControlled: true,
    preferredSupplierRefId: 'supplier-1',
    supplierSku: 'FC-ONT-6',
    purchaseUnitOfMeasure: 'caja',
    purchaseToBaseUomFactor: '10',
    standardCost: '118000',
    lastPurchaseCost: '115000',
    reorderPoint: '5',
    targetStock: '20',
    minimumOrderQty: '10',
    orderMultiple: '5',
    leadTimeDays: 7,
    usefulLifeMonths: 36,
    commercialReferenceId: 'COM-ONT-6',
    status: InventoryItemStatus.ACTIVE,
    createdAt: '2026-06-25T12:00:00.000Z',
    updatedAt: '2026-06-25T12:00:00.000Z',
    ...overrides,
  };
}

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: jest.fn().mockImplementation(() => ({
      matches,
      media: '',
      onchange: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
}

describe('InventoryClient', () => {
  beforeEach(() => {
    mockMatchMedia(false);
    inventoryApiMock.dashboard.mockResolvedValue({
      itemsCount: 3,
      locationsCount: 2,
      serializedAssetsCount: 4,
      balancesCount: 5,
      totalOnHand: 17,
    });
    inventoryApiMock.listItems.mockResolvedValue([buildCatalogItem()]);
    inventoryApiMock.getItem.mockImplementation(async (id) =>
      buildCatalogItem({ id, name: 'ONT WiFi 6 detalle' }),
    );
    inventoryApiMock.createItem.mockResolvedValue(
      buildCatalogItem({ id: 'item-2', sku: 'SW-100' }),
    );
    inventoryApiMock.updateItem.mockResolvedValue(
      buildCatalogItem({ name: 'ONT WiFi 6 actualizada' }),
    );
    inventoryApiMock.listCatalogOptions.mockResolvedValue([
      {
        id: 'item-1',
        sku: 'ONT-001',
        name: 'ONT WiFi 6',
        categoryId: 'cat-cpe',
        categoryName: 'CPE',
        categoryCode: 'CPE',
        category: InventoryItemCategory.CPE,
        itemKind: InventoryItemKind.SERIALIZED,
        unitOfMeasure: 'unidad',
        purchaseUnitOfMeasure: 'caja',
        standardCost: '118000',
        preferredSupplierRefId: 'supplier-1',
        preferredSupplierName: 'Proveedor Alfa',
        supplierSku: 'FC-ONT-6',
      },
    ]);
    inventoryApiMock.listCategories.mockResolvedValue([
      {
        id: 'cat-cpe',
        tenantId: 'tenant-1',
        code: 'CPE',
        name: 'CPE',
        description: null,
        status: InventoryCategoryStatus.ACTIVE,
        sortOrder: 0,
        productCount: 1,
        createdAt: '2026-06-25T12:00:00.000Z',
        updatedAt: '2026-06-25T12:00:00.000Z',
      },
    ]);
    inventoryApiMock.getCategory.mockImplementation(async (id) => ({
      id,
      tenantId: 'tenant-1',
      code: 'CPE',
      name: 'CPE',
      description: null,
      status: InventoryCategoryStatus.ACTIVE,
      sortOrder: 0,
      productCount: 1,
      createdAt: '2026-06-25T12:00:00.000Z',
      updatedAt: '2026-06-25T12:00:00.000Z',
    }));
    inventoryApiMock.createCategory.mockResolvedValue({
      id: 'cat-fiber',
      tenantId: 'tenant-1',
      code: 'FIBER',
      name: 'Fibra',
      description: null,
      status: InventoryCategoryStatus.ACTIVE,
      sortOrder: 1,
      productCount: 0,
      createdAt: '2026-06-30T12:00:00.000Z',
      updatedAt: '2026-06-30T12:00:00.000Z',
    });
    inventoryApiMock.updateCategory.mockResolvedValue({
      id: 'cat-cpe',
      tenantId: 'tenant-1',
      code: 'CPE',
      name: 'CPE actualizada',
      description: null,
      status: InventoryCategoryStatus.ACTIVE,
      sortOrder: 0,
      productCount: 1,
      createdAt: '2026-06-25T12:00:00.000Z',
      updatedAt: '2026-06-30T12:00:00.000Z',
    });
    inventoryApiMock.listLocations.mockResolvedValue([
      {
        id: 'loc-1',
        tenantId: 'tenant-1',
        code: 'BOD-01',
        name: 'Bodega principal',
        type: StockLocationType.MAIN_WAREHOUSE,
        status: StockLocationStatus.ACTIVE,
        responsibleRefId: null,
        maxCapacity: null,
        createdAt: '2026-06-25T12:00:00.000Z',
        updatedAt: '2026-06-25T12:00:00.000Z',
      },
    ]);
    inventoryApiMock.listAssets.mockResolvedValue([]);
    inventoryApiMock.listBalances.mockResolvedValue([
      {
        id: 'bal-1',
        tenantId: 'tenant-1',
        itemId: 'item-1',
        locationId: 'loc-1',
        lotId: null,
        condition: StockBalanceCondition.NEW,
        quantityOnHand: '1',
        quantityReserved: '0',
        createdAt: '2026-06-25T12:00:00.000Z',
        updatedAt: '2026-06-25T12:00:00.000Z',
      },
    ]);
    purchasingApiMock.listRequests.mockResolvedValue([
      {
        id: 'pr-1',
        tenantId: 'tenant-1',
        requestNumber: 'PR-000001',
        title: 'Reposición de ONT',
        status: PurchaseRequestStatus.PENDING_QUOTES,
        requestType: PurchaseRequestType.REPLENISHMENT,
        priority: PurchaseRequestPriority.NORMAL,
        requestedByUserId: 'user-1',
        requestingArea: 'Operaciones',
        justification: 'Reposición por consumo de campo',
        operationalRefType: null,
        operationalRefId: null,
        exceptionReason: null,
        approvedByUserId: null,
        neededByDate: '2026-06-30',
        notes: null,
        createdAt: '2026-06-25T12:00:00.000Z',
        updatedAt: '2026-06-25T12:00:00.000Z',
      },
    ]);
    purchasingApiMock.createRequest.mockResolvedValue({
      id: 'pr-2',
      tenantId: 'tenant-1',
      requestNumber: 'PR-000002',
      title: 'Nueva solicitud',
      status: PurchaseRequestStatus.PENDING_QUOTES,
      requestType: PurchaseRequestType.REPLENISHMENT,
      priority: PurchaseRequestPriority.NORMAL,
      requestedByUserId: 'user-1',
      requestingArea: 'Operaciones',
      justification: 'Reposición programada de inventario',
      operationalRefType: null,
      operationalRefId: null,
      exceptionReason: null,
      approvedByUserId: null,
      neededByDate: null,
      notes: null,
      createdAt: '2026-06-25T12:00:00.000Z',
      updatedAt: '2026-06-25T12:00:00.000Z',
    });
    purchasingApiMock.getRequestDetail.mockResolvedValue({
      request: {
        id: 'pr-1',
        tenantId: 'tenant-1',
        requestNumber: 'PR-000001',
        title: 'Reposición de ONT',
        status: PurchaseRequestStatus.PENDING_QUOTES,
        requestType: PurchaseRequestType.REPLENISHMENT,
        priority: PurchaseRequestPriority.NORMAL,
        requestedByUserId: 'user-1',
        requestingArea: 'Operaciones',
        justification: 'Reposición por consumo de campo',
        operationalRefType: null,
        operationalRefId: null,
        exceptionReason: null,
        approvedByUserId: null,
        neededByDate: '2026-06-30',
        notes: null,
        createdAt: '2026-06-25T12:00:00.000Z',
        updatedAt: '2026-06-25T12:00:00.000Z',
      },
      lines: [],
      quotes: [],
      awards: [],
      orders: [],
      estimatedAmount: 0,
      approvalPolicy: {
        canApprove: false,
        requiresException: false,
        blockingReason: 'Falta cotización',
        approvalLevel: 'SUPERVISOR',
      },
    });
    purchasingApiMock.getProviderSummary.mockResolvedValue({
      partyRefId: 'supplier-1',
      displayName: 'Proveedor Alfa',
      primaryContact: 'Ana Operaciones',
      phone: '3001234567',
      email: 'contacto@proveedor.test',
      city: 'Bogotá',
      status: 'Activo',
    });
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
    purchasingApiMock.addQuote.mockResolvedValue({
      id: 'quote-1',
      tenantId: 'tenant-1',
      purchaseRequestId: 'pr-1',
      partyRefId: 'supplier-1',
      quoteNumber: 'COT-001',
      amount: '350000',
      currency: 'COP',
      validUntil: null,
      notes: null,
      createdAt: '2026-06-25T12:00:00.000Z',
      updatedAt: '2026-06-25T12:00:00.000Z',
    });
    purchasingApiMock.approveRequest.mockResolvedValue({
      id: 'pr-1',
      tenantId: 'tenant-1',
      requestNumber: 'PR-000001',
      title: 'Reposición de ONT',
      status: PurchaseRequestStatus.APPROVED,
      requestType: PurchaseRequestType.REPLENISHMENT,
      priority: PurchaseRequestPriority.NORMAL,
      requestedByUserId: 'user-1',
      requestingArea: 'Operaciones',
      justification: 'Reposición por consumo de campo',
      operationalRefType: null,
      operationalRefId: null,
      exceptionReason: null,
      approvedByUserId: 'user-1',
      neededByDate: '2026-06-30',
      notes: null,
      createdAt: '2026-06-25T12:00:00.000Z',
      updatedAt: '2026-06-25T12:00:00.000Z',
    });
    purchasingApiMock.createOrder.mockResolvedValue({
      id: 'po-1',
      tenantId: 'tenant-1',
      orderNumber: 'PO-000001',
      purchaseRequestId: 'pr-1',
      partyRefId: 'supplier-1',
      status: PurchaseOrderStatus.APPROVED,
      expectedDeliveryDate: null,
      approvedByUserId: 'user-1',
      notes: null,
      createdAt: '2026-06-25T12:00:00.000Z',
      updatedAt: '2026-06-25T12:00:00.000Z',
    });
    purchasingApiMock.listOrders.mockResolvedValue([]);
    purchasingApiMock.getOrder.mockResolvedValue({
      id: 'po-1',
      tenantId: 'tenant-1',
      orderNumber: 'PO-000001',
      purchaseRequestId: 'pr-1',
      partyRefId: 'supplier-1',
      status: PurchaseOrderStatus.APPROVED,
      expectedDeliveryDate: null,
      approvedByUserId: 'user-1',
      notes: null,
      createdAt: '2026-06-25T12:00:00.000Z',
      updatedAt: '2026-06-25T12:00:00.000Z',
      lines: [],
    });
    purchasingApiMock.receiveOrder.mockResolvedValue({
      receipt: {
        id: 'gr-1',
        tenantId: 'tenant-1',
        receiptNumber: 'GR-000001',
        purchaseOrderId: 'po-1',
        status: GoodsReceiptStatus.COMPLETED,
        receivedAt: '2026-06-25T12:00:00.000Z',
        receivedByUserId: 'user-1',
        notes: null,
        createdAt: '2026-06-25T12:00:00.000Z',
        updatedAt: '2026-06-25T12:00:00.000Z',
      },
      movement: {
        id: 'mov-1',
        tenantId: 'tenant-1',
        movementNumber: 'MOV-000001',
        origin: StockMovementOrigin.PURCHASE_RECEIPT,
        originContext: 'purchasing.receipt',
        originRefId: 'gr-1',
        idempotencyKey: 'receipt',
        notes: null,
        actorUserId: 'user-1',
        reversedByMovementId: null,
        isReversal: false,
        createdAt: '2026-06-25T12:00:00.000Z',
        updatedAt: '2026-06-25T12:00:00.000Z',
      },
      lines: [],
    });
    inventoryApiMock.transfer.mockResolvedValue({
      movement: {
        id: 'mov-2',
        tenantId: 'tenant-1',
        movementNumber: 'MOV-000002',
        origin: StockMovementOrigin.TRANSFER,
        originContext: 'inventory.transfer',
        originRefId: 'item-1',
        idempotencyKey: 'transfer',
        notes: null,
        actorUserId: 'user-1',
        reversedByMovementId: null,
        isReversal: false,
        createdAt: '2026-06-25T12:00:00.000Z',
        updatedAt: '2026-06-25T12:00:00.000Z',
      },
      lines: [],
    });
    inventoryApiMock.sale.mockResolvedValue({
      movement: {
        id: 'mov-3',
        tenantId: 'tenant-1',
        movementNumber: 'MOV-000003',
        origin: StockMovementOrigin.SALE,
        originContext: 'inventory.sale',
        originRefId: 'sale-1',
        idempotencyKey: 'sale',
        notes: null,
        actorUserId: 'user-1',
        reversedByMovementId: null,
        isReversal: false,
        createdAt: '2026-06-25T12:00:00.000Z',
        updatedAt: '2026-06-25T12:00:00.000Z',
      },
      lines: [],
    });
    inventoryApiMock.registerReturn.mockResolvedValue({
      movement: {
        id: 'mov-4',
        tenantId: 'tenant-1',
        movementNumber: 'MOV-000004',
        origin: StockMovementOrigin.RETURN,
        originContext: 'inventory.return',
        originRefId: 'return-1',
        idempotencyKey: 'return',
        notes: null,
        actorUserId: 'user-1',
        reversedByMovementId: null,
        isReversal: false,
        createdAt: '2026-06-25T12:00:00.000Z',
        updatedAt: '2026-06-25T12:00:00.000Z',
      },
      lines: [],
    });
    inventoryApiMock.writeOff.mockResolvedValue({
      movement: {
        id: 'mov-5',
        tenantId: 'tenant-1',
        movementNumber: 'MOV-000005',
        origin: StockMovementOrigin.WRITE_OFF,
        originContext: 'inventory.write-off',
        originRefId: 'item-1',
        idempotencyKey: 'writeoff',
        notes: null,
        actorUserId: 'user-1',
        reversedByMovementId: null,
        isReversal: false,
        createdAt: '2026-06-25T12:00:00.000Z',
        updatedAt: '2026-06-25T12:00:00.000Z',
      },
      lines: [],
    });
  });

  it('expone etiquetas amigables para enums del módulo', () => {
    expect(getInventoryItemCategoryLabel(InventoryItemCategory.CPE)).toBe('CPE');
    expect(getPurchaseRequestStatusLabel(PurchaseRequestStatus.PENDING_QUOTES)).toBe(
      'Pendiente de cotizaciones',
    );
    expect(formatInventoryCurrency('120000')).toContain('$');
  });

  it('renderiza el dashboard y el workspace de compras', async () => {
    render(<InventoryClient />);

    expect(screen.getByRole('heading', { name: 'Inventario' })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Ítems catalogados')).toBeInTheDocument();
    });

    expect(screen.getByText('Referencias bajo mínimo')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Compras' }));

    await waitFor(() => {
      expect(screen.getByText('Resumen de compras')).toBeInTheDocument();
      expect(screen.getByText('PR-000001')).toBeInTheDocument();
      expect(screen.getByText('Por cotizar')).toBeInTheDocument();
    });
  });

  it('permite crear una solicitud con líneas desde el compositor', async () => {
    render(<InventoryClient />);

    await waitFor(() => {
      expect(screen.getByText('Ítems catalogados')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Compras' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Nueva solicitud' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Nueva solicitud' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Título')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Título'), {
      target: { value: 'Nueva solicitud de abastecimiento' },
    });
    fireEvent.change(screen.getByLabelText('Área solicitante'), {
      target: { value: 'Operaciones' },
    });
    fireEvent.change(screen.getByLabelText('Justificación'), {
      target: { value: 'Reposición programada por consumo de campo en zona norte' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear solicitud' }));

    await waitFor(() => {
      expect(purchasingApiMock.createRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Nueva solicitud de abastecimiento',
          requestingArea: 'Operaciones',
          lines: expect.arrayContaining([
            expect.objectContaining({
              quantityRequested: 1,
            }),
          ]),
        }),
      );
    });
  });

  it('abre el drawer de trabajo y muestra la ficha del proveedor', async () => {
    render(<InventoryClient />);

    await waitFor(() => {
      expect(screen.getByText('Ítems catalogados')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Compras' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Abrir' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }));

    await waitFor(() => {
      expect(purchasingApiMock.getRequestDetail).toHaveBeenCalledWith('pr-1');
      expect(screen.getByText('Trabajar solicitud')).toBeInTheDocument();
    });
  });

  it('renderiza la pestaña Catálogo con filtros y tabla enriquecida', async () => {
    render(<InventoryClient />);

    await waitFor(() => {
      expect(screen.getByText('Ítems catalogados')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Catálogo' }));

    await waitFor(() => {
      expect(screen.getByText('Catálogo operativo')).toBeInTheDocument();
      expect(screen.getByText('Comprables')).toBeInTheDocument();
      expect(screen.getByLabelText('Buscar')).toBeInTheDocument();
      expect(screen.getByText('ONT-001')).toBeInTheDocument();
      expect(screen.getByText('Proveedor Alfa')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Buscar'), {
      target: { value: 'ONT' },
    });

    await waitFor(() => {
      expect(inventoryApiMock.listItems).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'ONT' }),
      );
    });
  });
});
