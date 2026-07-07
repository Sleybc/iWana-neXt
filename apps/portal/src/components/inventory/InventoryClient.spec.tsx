import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  GoodsReceiptStatus,
  InventoryResponsibleType,
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
  SerializedAssetStatus,
  StockBalanceCondition,
  StockLocationStatus,
  StockLocationType,
  StockMovementOrigin,
} from '@iwana/shared';
import {
  ApiError,
  inventoryApi,
  purchasingApi,
  type InventoryCategoryRecord,
  type InventoryItemRecord,
} from '@/lib/api-client';
import { InventoryClient } from './InventoryClient';
import {
  formatInventoryCurrency,
  getInventoryItemCategoryLabel,
  getPurchaseRequestStatusLabel,
} from './inventory-labels';

const MOBILE_RESPONSIBLE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const UPDATED_RESPONSIBLE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const replaceMock = jest.fn();
let pathnameMock = '/dashboard/inventory';
let searchParamsMock = new URLSearchParams();

jest.mock('next/navigation', () => ({
  usePathname: () => pathnameMock,
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => searchParamsMock,
}));

jest.mock('@/lib/api-client', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    code?: string;
    constructor(
      statusOrMessage: number | string,
      codeOrStatus?: string | number,
      message?: string,
    ) {
      const resolvedMessage =
        typeof message === 'string'
          ? message
          : typeof statusOrMessage === 'string'
            ? statusOrMessage
            : 'Error';
      const resolvedStatus =
        typeof statusOrMessage === 'number'
          ? statusOrMessage
          : typeof codeOrStatus === 'number'
            ? codeOrStatus
            : 500;

      super(resolvedMessage);
      this.status = resolvedStatus;
      if (typeof codeOrStatus === 'string') {
        this.code = codeOrStatus;
      }
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
    suggestCategoryPrefix: jest.fn(),
    getCategory: jest.fn(),
    createCategory: jest.fn(),
    updateCategory: jest.fn(),
    listLocations: jest.fn(),
    createLocation: jest.fn(),
    updateLocation: jest.fn(),
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
    replaceMock.mockReset();
    pathnameMock = '/dashboard/inventory';
    searchParamsMock = new URLSearchParams();
    inventoryApiMock.createItem.mockClear();
    inventoryApiMock.dashboard.mockResolvedValue({
      itemsCount: 3,
      locationsCount: 2,
      serializedAssetsCount: 4,
      balancesCount: 5,
      totalOnHand: 17,
      balancesByLocation: [
        {
          locationId: 'loc-1',
          locationCode: 'BOD-01',
          locationName: 'Bodega principal',
          totalOnHand: 1,
          uniqueItems: 1,
        },
      ],
      balancesByCategory: [
        {
          categoryId: 'cat-cpe',
          categoryCodePrefix: 'CPE',
          categoryName: 'CPE',
          totalOnHand: 1,
          uniqueItems: 1,
        },
      ],
      serializedAssetsByStatus: [
        {
          status: SerializedAssetStatus.AVAILABLE,
          count: 2,
        },
      ],
      serializedAssetsByResponsibleType: [
        {
          responsibleType: InventoryResponsibleType.WAREHOUSE,
          count: 2,
        },
      ],
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
        codePrefix: 'CPE',
        name: 'CPE',
        description: null,
        status: InventoryCategoryStatus.ACTIVE,
        sortOrder: 0,
        productCount: 1,
        createdAt: '2026-06-25T12:00:00.000Z',
        updatedAt: '2026-06-25T12:00:00.000Z',
      },
    ]);
    inventoryApiMock.suggestCategoryPrefix.mockResolvedValue({
      code: 'FIBRAFO',
      codePrefix: 'FIBFO',
      sortOrder: 1,
    });
    inventoryApiMock.getCategory.mockImplementation(async (id) => ({
      id,
      tenantId: 'tenant-1',
      code: 'CPE',
      codePrefix: 'CPE',
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
      codePrefix: 'FIB',
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
      codePrefix: 'CPE',
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
      {
        id: 'loc-2',
        tenantId: 'tenant-1',
        code: 'MOV-02',
        name: 'Móvil técnico norte',
        type: StockLocationType.MOBILE_TECHNICIAN,
        status: StockLocationStatus.ACTIVE,
        responsibleRefId: MOBILE_RESPONSIBLE_ID,
        maxCapacity: '1.00',
        createdAt: '2026-06-25T12:00:00.000Z',
        updatedAt: '2026-06-25T12:00:00.000Z',
      },
    ]);
    inventoryApiMock.createLocation.mockResolvedValue({
      id: 'loc-2',
      tenantId: 'tenant-1',
      code: 'MOV-01',
      name: 'Móvil zona norte',
      type: StockLocationType.MOBILE_TECHNICIAN,
      status: StockLocationStatus.ACTIVE,
      responsibleRefId: MOBILE_RESPONSIBLE_ID,
      maxCapacity: '10.00',
      createdAt: '2026-06-26T12:00:00.000Z',
      updatedAt: '2026-06-26T12:00:00.000Z',
    });
    inventoryApiMock.updateLocation.mockResolvedValue({
      id: 'loc-1',
      tenantId: 'tenant-1',
      code: 'BOD-01',
      name: 'Bodega principal actualizada',
      type: StockLocationType.MAIN_WAREHOUSE,
      status: StockLocationStatus.ACTIVE,
      responsibleRefId: UPDATED_RESPONSIBLE_ID,
      maxCapacity: '24.00',
      createdAt: '2026-06-25T12:00:00.000Z',
      updatedAt: '2026-06-26T12:00:00.000Z',
    });
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
      expect(screen.getByText('Productos catalogados')).toBeInTheDocument();
    });

    expect(screen.getByText('Referencias bajo mínimo')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Compras' }));

    await waitFor(() => {
      expect(screen.getByText('Resumen de compras')).toBeInTheDocument();
      expect(screen.getByText('PR-000001')).toBeInTheDocument();
      expect(screen.getByText('Por cotizar')).toBeInTheDocument();
    });
  });

  it('abre bodegas cuando tab=locations viene en la URL', async () => {
    searchParamsMock = new URLSearchParams('tab=locations');

    render(<InventoryClient initialTab="locations" />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Bodegas', selected: true })).toBeInTheDocument();
      expect(screen.getByText('Matriz de bodegas')).toBeInTheDocument();
    });
  });

  it('permite crear una bodega desde la pestaña de bodegas', async () => {
    const user = userEvent.setup();
    render(<InventoryClient initialTab="locations" />);

    await waitFor(() => {
      expect(screen.getByText('Matriz de bodegas')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Crear bodega' }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Código'), 'MOV-01');
    await user.type(within(dialog).getByLabelText('Nombre'), 'Móvil zona norte');
    await user.selectOptions(
      within(dialog).getByLabelText('Tipo'),
      StockLocationType.MOBILE_TECHNICIAN,
    );
    await user.type(within(dialog).getByLabelText('Responsable operativo'), MOBILE_RESPONSIBLE_ID);
    await user.type(within(dialog).getByLabelText('Capacidad máxima'), '10');
    await user.click(within(dialog).getByRole('button', { name: 'Crear bodega' }));

    await waitFor(() => {
      expect(inventoryApiMock.createLocation).toHaveBeenCalledWith({
        code: 'MOV-01',
        name: 'Móvil zona norte',
        type: StockLocationType.MOBILE_TECHNICIAN,
        status: StockLocationStatus.ACTIVE,
        responsibleRefId: MOBILE_RESPONSIBLE_ID,
        maxCapacity: 10,
      });
    });
  });

  it('bloquea crear bodega móvil con responsable no válido', async () => {
    const user = userEvent.setup();
    render(<InventoryClient initialTab="locations" />);

    await waitFor(() => {
      expect(screen.getByText('Matriz de bodegas')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Crear bodega' }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Código'), 'MOV-01');
    await user.type(within(dialog).getByLabelText('Nombre'), 'Móvil zona norte');
    await user.selectOptions(
      within(dialog).getByLabelText('Tipo'),
      StockLocationType.MOBILE_TECHNICIAN,
    );
    await user.type(within(dialog).getByLabelText('Responsable operativo'), 'tech-01');

    expect(within(dialog).getByRole('button', { name: 'Crear bodega' })).toBeDisabled();
  });

  it('permite editar responsable y capacidad de una bodega existente', async () => {
    const user = userEvent.setup();
    render(<InventoryClient initialTab="locations" />);

    await waitFor(() => {
      expect(screen.getByText('Matriz de bodegas')).toBeInTheDocument();
    });

    await user.click(await screen.findByRole('button', { name: 'Editar Bodega principal' }));

    const dialog = await screen.findByRole('dialog');
    const nameInput = within(dialog).getByLabelText('Nombre');
    const responsibleInput = within(dialog).getByLabelText('Responsable operativo');
    const capacityInput = within(dialog).getByLabelText('Capacidad máxima');

    await user.clear(nameInput);
    await user.type(nameInput, 'Bodega principal actualizada');
    await user.type(responsibleInput, UPDATED_RESPONSIBLE_ID);
    await user.clear(capacityInput);
    await user.type(capacityInput, '24');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(inventoryApiMock.updateLocation).toHaveBeenCalledWith('loc-1', {
        name: 'Bodega principal actualizada',
        status: StockLocationStatus.ACTIVE,
        responsibleRefId: UPDATED_RESPONSIBLE_ID,
        maxCapacity: 24,
      });
    });
  });

  it('filtra custodias móviles cuando custody=mobile viene en la URL', async () => {
    searchParamsMock = new URLSearchParams('tab=locations&custody=mobile');

    render(<InventoryClient initialTab="locations" />);

    await waitFor(() => {
      expect(screen.getByText('Matriz de bodegas')).toBeInTheDocument();
      expect(screen.getByText('Móvil técnico norte')).toBeInTheDocument();
      expect(screen.getByText('MOV-02')).toBeInTheDocument();
      expect(screen.queryByText('BOD-01')).not.toBeInTheDocument();
    });
  });

  it('permite ver balances por ubicación en la matriz de bodegas', async () => {
    const user = userEvent.setup();
    render(<InventoryClient initialTab="locations" />);

    await waitFor(() => {
      expect(screen.getByText('Matriz de bodegas')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Ver balances de Bodega principal' }),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Ver balances de Bodega principal' }));

    expect(await screen.findByText(/ONT-001 · ONT WiFi 6/i)).toBeInTheDocument();
  });

  it('bloquea transferencias sin acta o por saldo insuficiente', async () => {
    const user = userEvent.setup();
    render(<InventoryClient initialTab="locations" />);

    await waitFor(() => {
      expect(screen.getByText('Matriz de bodegas')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Transferir stock' }));

    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Ítem'), 'item-1');
    await user.selectOptions(within(dialog).getByLabelText('Origen'), 'loc-1');
    await user.selectOptions(within(dialog).getByLabelText('Destino'), 'loc-2');
    await user.clear(within(dialog).getByLabelText('Cantidad'));
    await user.type(within(dialog).getByLabelText('Cantidad'), '2');

    expect(
      within(dialog).getByText(/Disponible en origen \(saldo nuevo sin lote\): 1/i),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Registrar transferencia' })).toBeDisabled();

    await user.type(within(dialog).getByLabelText('Acta o evidencia'), 'ACT-004');

    expect(within(dialog).getByRole('button', { name: 'Registrar transferencia' })).toBeDisabled();
    expect(inventoryApiMock.transfer).not.toHaveBeenCalled();
  });

  it('limita los retornos a estados operativos permitidos', async () => {
    const user = userEvent.setup();
    render(<InventoryClient />);

    await waitFor(() => {
      expect(screen.getByText('Productos catalogados')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: 'Movimientos' }));

    const statusSelect = await screen.findByLabelText('Estado destino');
    expect(statusSelect).toHaveValue(SerializedAssetStatus.IN_TRANSIT);
    expect(screen.getByRole('option', { name: 'En tránsito' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'En pruebas' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Disponible' })).not.toBeInTheDocument();
  });

  it('permite crear una solicitud con lineas desde el compositor', async () => {
    const user = userEvent.setup();
    render(<InventoryClient />);

    await waitFor(() => {
      expect(screen.getByText('Productos catalogados')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: 'Compras' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Nueva solicitud' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Nueva solicitud' }));

    await waitFor(() => {
      expect(screen.getByLabelText(/T[ií]tulo/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: /Catalogo/i }));
    await user.click(screen.getByRole('checkbox', { name: /Seleccionar ONT-001 - ONT WiFi 6/i }));
    await user.click(screen.getByRole('button', { name: /Agregar 1 producto/i }));

    fireEvent.change(screen.getByLabelText(/T[ií]tulo/i), {
      target: { value: 'Nueva solicitud de abastecimiento' },
    });
    fireEvent.change(screen.getByLabelText(/[ÁA]rea solicitante/i), {
      target: { value: 'Operaciones' },
    });
    fireEvent.change(screen.getByLabelText('Justificacion'), {
      target: { value: 'Reposicion programada por consumo de campo en zona norte' },
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
  }, 15000);

  it('preserves selected products while moving between sugeridos and catalogo', async () => {
    const user = userEvent.setup();
    render(<InventoryClient />);

    await waitFor(() => {
      expect(screen.getByText('Productos catalogados')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: 'Compras' }));
    await user.click(screen.getByRole('button', { name: 'Nueva solicitud' }));
    await user.click(screen.getByRole('tab', { name: /Catalogo/i }));
    await user.click(screen.getByRole('checkbox', { name: /Seleccionar ONT-001 - ONT WiFi 6/i }));
    await user.click(screen.getByRole('tab', { name: /Sugeridos/i }));
    await user.click(screen.getByRole('tab', { name: /Catalogo/i }));

    expect(
      screen.getByRole('checkbox', { name: /Seleccionar ONT-001 - ONT WiFi 6/i }),
    ).toBeChecked();
  });

  it('switches from tray mode to create mode without keeping the tray visible', async () => {
    const user = userEvent.setup();
    mockMatchMedia(true);
    render(<InventoryClient />);

    await waitFor(() => {
      expect(screen.getByText('Productos catalogados')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: 'Compras' }));

    await waitFor(() => {
      expect(screen.getByText('Bandeja de solicitudes')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Nueva solicitud' }));

    expect(screen.getByText('Nueva solicitud de compra')).toBeInTheDocument();
    expect(screen.queryByText('Bandeja de solicitudes')).not.toBeInTheDocument();
  });

  it('returns to tray mode without resetting active filters', async () => {
    const user = userEvent.setup();
    mockMatchMedia(true);
    render(<InventoryClient />);

    await waitFor(() => {
      expect(screen.getByText('Productos catalogados')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: 'Compras' }));

    const searchInput = await screen.findByLabelText('Buscar');
    await user.type(searchInput, 'Reposición');
    expect(searchInput).toHaveValue('Reposición');

    await user.click(screen.getByRole('button', { name: 'Nueva solicitud' }));
    await user.click(screen.getByRole('button', { name: 'Volver a la bandeja' }));

    expect(await screen.findByText('Bandeja de solicitudes')).toBeInTheDocument();
    expect(screen.getByLabelText('Buscar')).toHaveValue('Reposición');
  });

  it('keeps create mode open when request creation fails', async () => {
    mockMatchMedia(true);
    purchasingApiMock.createRequest.mockRejectedValueOnce(
      new ApiError(500, 'PURCHASE_REQUEST_CREATE_FAILED', 'No se pudo crear la solicitud.'),
    );

    render(<InventoryClient />);

    await waitFor(() => {
      expect(screen.getByText('Productos catalogados')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Compras' }));
    fireEvent.click(screen.getByRole('button', { name: 'Nueva solicitud' }));

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Catalogo \(1\)/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('tab', { name: /Catalogo/i }));
    fireEvent.click(
      await screen.findByRole('checkbox', { name: /Seleccionar ONT-001 - ONT WiFi 6/i }),
    );
    fireEvent.click(screen.getByRole('button', { name: /Agregar 1 producto/i }));

    fireEvent.change(screen.getByLabelText(/T[ií]tulo/i), {
      target: { value: 'Nueva solicitud fallida' },
    });
    fireEvent.change(screen.getByLabelText(/[ÁA]rea solicitante/i), {
      target: { value: 'Operaciones' },
    });
    fireEvent.change(screen.getByLabelText('Justificacion'), {
      target: { value: 'Reposicion programada' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear solicitud' }));

    await waitFor(() => {
      expect(screen.getByText('Nueva solicitud de compra')).toBeInTheDocument();
      expect(screen.queryByText('Bandeja de solicitudes')).not.toBeInTheDocument();
      expect(screen.getByText('No se pudo crear la solicitud')).toBeInTheDocument();
    });
  }, 10000);

  it('shows a two-step create flow on mobile instead of a long dialog', async () => {
    mockMatchMedia(false);
    render(<InventoryClient />);

    await waitFor(() => {
      expect(screen.getByText('Productos catalogados')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Compras' }));
    fireEvent.click(screen.getByRole('button', { name: 'Nueva solicitud' }));

    expect(screen.getByText('Paso 1 de 2')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Sugeridos/i })).toBeInTheDocument();
    expect(screen.queryByText('Bandeja de solicitudes')).not.toBeInTheDocument();
  });

  it('abre el drawer de trabajo y muestra la ficha del proveedor', async () => {
    render(<InventoryClient />);

    await waitFor(() => {
      expect(screen.getByText('Productos catalogados')).toBeInTheDocument();
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
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    try {
      render(<InventoryClient />);

      await waitFor(() => {
        expect(screen.getByText('Productos catalogados')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('tab', { name: 'Catálogo' }));

      await act(async () => {
        jest.advanceTimersByTime(1);
      });

      await waitFor(() => {
        expect(screen.getByText('Catálogo operativo')).toBeInTheDocument();
        expect(screen.getAllByText('Para compras').length).toBeGreaterThan(0);
        expect(screen.getByLabelText('Buscar producto')).toBeInTheDocument();
        expect(screen.getByText('ONT-001')).toBeInTheDocument();
        expect(screen.getByText('Proveedor Alfa')).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText('Buscar producto'), 'ONT');

      await act(async () => {
        jest.advanceTimersByTime(350);
      });

      await waitFor(() => {
        expect(
          inventoryApiMock.listItems.mock.calls.some(
            ([params]) => params && 'search' in params && params.search === 'ONT',
          ),
        ).toBe(true);
      });
    } finally {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    }
  });

  it('abre el alta mínima desde catálogo y crea un producto con datos base', async () => {
    render(<InventoryClient />);

    await waitFor(() => {
      expect(screen.getByText('Productos catalogados')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Catálogo' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Nuevo producto' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo producto' }));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Nuevo producto' })).toBeInTheDocument();
    });

    expect(screen.queryByRole('tab', { name: 'General' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('SKU')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Switch acceso capa 2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear producto' }));

    await waitFor(() => {
      expect(inventoryApiMock.createItem).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Switch acceso capa 2',
          categoryId: 'cat-cpe',
          itemKind: InventoryItemKind.STOCK,
          trackingMode: InventoryTrackingMode.CONSUMABLE,
          unitOfMeasure: 'unidad',
          purchasable: true,
          inventoryControlled: true,
          status: InventoryItemStatus.ACTIVE,
        }),
      );
    });

    expect(inventoryApiMock.createItem.mock.calls[0]?.[0]).not.toHaveProperty('sku');

    await waitFor(() => {
      expect(
        screen.getByText(
          'Producto creado. Ya puedes usarlo en el catálogo y completar su configuración después.',
        ),
      ).toBeInTheDocument();
    });
  });

  it('permite crear una categoría inline y la usa en el alta del producto', async () => {
    const baseCategory: InventoryCategoryRecord = {
      id: 'cat-cpe',
      tenantId: 'tenant-1',
      code: 'CPE',
      codePrefix: 'CPE',
      name: 'CPE',
      description: null,
      status: InventoryCategoryStatus.ACTIVE,
      sortOrder: 0,
      productCount: 1,
      createdAt: '2026-06-25T12:00:00.000Z',
      updatedAt: '2026-06-25T12:00:00.000Z',
    };
    const newCategory: InventoryCategoryRecord = {
      id: 'cat-fiber',
      tenantId: 'tenant-1',
      code: 'FIBRAFO',
      codePrefix: 'FIBFO',
      name: 'Fibra óptica',
      description: null,
      status: InventoryCategoryStatus.ACTIVE,
      sortOrder: 1,
      productCount: 0,
      createdAt: '2026-06-30T12:00:00.000Z',
      updatedAt: '2026-06-30T12:00:00.000Z',
    };
    let categoryList = [baseCategory];

    inventoryApiMock.listCategories.mockImplementation(async () => categoryList);
    inventoryApiMock.createCategory.mockImplementation(async () => {
      categoryList = [baseCategory, newCategory];
      return newCategory;
    });

    render(<InventoryClient />);

    await waitFor(() => {
      expect(screen.getByText('Productos catalogados')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Catálogo' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Nuevo producto' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Crear categoría aquí' }));

    fireEvent.change(screen.getByLabelText('Nombre de la categoría'), {
      target: { value: 'Fibra óptica' },
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Prefijo de producto')).toHaveValue('FIBFO');
    });

    fireEvent.change(screen.getByLabelText('Descripción corta'), {
      target: { value: 'Accesorios y materiales' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar categoría' }));

    await waitFor(() => {
      expect(inventoryApiMock.createCategory).toHaveBeenCalledWith(
        expect.objectContaining({
          codePrefix: 'FIB',
          name: 'Fibra óptica',
          description: 'Accesorios y materiales',
          status: InventoryCategoryStatus.ACTIVE,
          sortOrder: 1,
        }),
      );
    });

    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Patch cord monomodo' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear producto' }));

    await waitFor(() => {
      expect(inventoryApiMock.createItem).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Patch cord monomodo',
          categoryId: 'cat-fiber',
        }),
      );
    });
  });

  it('muestra el error de creación de producto dentro del alta rápida', async () => {
    inventoryApiMock.createItem.mockRejectedValueOnce(
      new ApiError(500, 'INVENTORY_ITEM_CREATE_FAILED', 'No se pudo guardar el producto.'),
    );

    render(<InventoryClient />);

    await waitFor(() => {
      expect(screen.getByText('Productos catalogados')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Catálogo' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Nuevo producto' }));
    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Router WiFi 7' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear producto' }));

    await waitFor(() => {
      expect(inventoryApiMock.createItem).toHaveBeenCalled();
    });

    expect(await screen.findByText('No fue posible crear el producto')).toBeInTheDocument();
  });

  it('muestra el error de creación de categoría inline', async () => {
    inventoryApiMock.createCategory.mockRejectedValueOnce(
      new ApiError(409, 'INVENTORY_CATEGORY_DUPLICATE', 'La categoría ya existe.'),
    );

    render(<InventoryClient />);

    await waitFor(() => {
      expect(screen.getByText('Productos catalogados')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Catálogo' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Nuevo producto' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Crear categoría aquí' }));
    fireEvent.change(screen.getByLabelText('Nombre de la categoría'), {
      target: { value: 'Fibra óptica' },
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Prefijo de producto')).toHaveValue('FIBFO');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Guardar categoría' }));

    await waitFor(() => {
      expect(inventoryApiMock.createCategory).toHaveBeenCalled();
    });

    expect(await screen.findByText('No fue posible crear la categoría')).toBeInTheDocument();
  });

  it('abre la edición mínima del producto y envía solo datos base del catálogo', async () => {
    render(<InventoryClient />);

    await waitFor(() => {
      expect(screen.getByText('Productos catalogados')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Catálogo' }));

    const skuCell = await screen.findByText('ONT-001');
    fireEvent.click(skuCell.closest('tr') as HTMLElement);

    await waitFor(() => {
      expect(inventoryApiMock.getItem).toHaveBeenCalledWith('item-1');
    });

    const dialog = await screen.findByRole('dialog', { name: /Editar producto/i });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText(/ONT WiFi 6/i)).toBeInTheDocument();
    expect(within(dialog).queryByRole('tab', { name: 'General' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('tab', { name: 'Compras' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('tab', { name: 'Inventario' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('tab', { name: 'Activos' })).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole('tab', { name: 'Relación comercial' }),
    ).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText('Categoría')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Trazabilidad')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Estado')).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        'Compras, inventario y activos se administran desde sus vistas operativas.',
      ),
    ).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText('Nombre'), {
      target: { value: 'ONT WiFi 6 catálogo' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(inventoryApiMock.updateItem).toHaveBeenCalledWith('item-1', {
        name: 'ONT WiFi 6 catálogo',
        description: 'Terminal óptica de campo',
        brand: 'FiberCo',
        model: 'XGS-6',
        itemKind: InventoryItemKind.SERIALIZED,
        categoryId: 'cat-cpe',
        trackingMode: InventoryTrackingMode.SERIALIZED,
        unitOfMeasure: 'unidad',
        status: InventoryItemStatus.ACTIVE,
      });
    });

    const updatePayload = inventoryApiMock.updateItem.mock.calls.at(-1)?.[1];
    expect(updatePayload).not.toHaveProperty('purchasable');
    expect(updatePayload).not.toHaveProperty('preferredSupplierRefId');
    expect(updatePayload).not.toHaveProperty('inventoryControlled');
    expect(updatePayload).not.toHaveProperty('assetControlled');
    expect(updatePayload).not.toHaveProperty('commercialReferenceId');
  });
});
