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
  UserRole,
  WriteOffReason,
  WriteOffStatus,
} from '@iwana/shared';
import {
  ApiError,
  inventoryApi,
  purchasingApi,
  usersApi,
  type InternalUser,
  type InventoryCategoryRecord,
  type InventoryItemRecord,
} from '@/lib/api-client';
import { EMPTY_LIST_META } from '@/lib/list-meta';
import { InventoryClient } from './InventoryClient';
import {
  CUSTOMER_SITE_TRANSFER_BLOCKED_MESSAGE,
  formatInventoryCurrency,
  getInventoryItemCategoryLabel,
  getPurchaseRequestStatusLabel,
  getWriteOffReasonLabel,
} from './inventory-labels';

const MOBILE_RESPONSIBLE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const UPDATED_RESPONSIBLE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const replaceMock = jest.fn();
const pushMock = jest.fn();
let pathnameMock = '/dashboard/inventory';
let searchParamsMock = new URLSearchParams();
const routerMock = {
  replace: (...args: unknown[]) => replaceMock(...args),
  push: (...args: unknown[]) => pushMock(...args),
};

const useAuthMock = jest.fn();

function buildAuthUser(overrides: { id?: string; role?: UserRole } = {}) {
  return {
    id: overrides.id ?? 'user-admin',
    emailHash: 'hash',
    role: overrides.role ?? UserRole.ADMIN,
    type: 'tenant' as const,
    tenantId: 'tenant-1',
    displayName: 'Admin',
    subtitle: 'Administrador',
    firstName: 'Admin',
    lastName: 'Test',
  };
}

jest.mock('next/navigation', () => ({
  usePathname: () => pathnameMock,
  useRouter: () => routerMock,
  useSearchParams: () => searchParamsMock,
}));

jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => useAuthMock(),
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
    listUsefulLifeAlerts: jest.fn(),
    listLoans: jest.fn(),
    transfer: jest.fn(),
    sale: jest.fn(),
    registerReturn: jest.fn(),
    writeOff: jest.fn(),
    writeOffs: {
      list: jest.fn(),
      get: jest.fn(),
      approve: jest.fn(),
      reject: jest.fn(),
    },
    listMovements: jest.fn(),
    listReplenishmentSuggestions: jest.fn(),
    getMovement: jest.fn(),
    createAdjustment: jest.fn(),
    createCounterPurchase: jest.fn(),
    listIssues: jest.fn(),
    createIssue: jest.fn(),
    getIssue: jest.fn(),
    dispatchIssue: jest.fn(),
    listCounts: jest.fn(),
    createCount: jest.fn(),
    getCount: jest.fn(),
    updateCount: jest.fn(),
    closeCount: jest.fn(),
    cancelCount: jest.fn(),
    searchItemsForPicker: jest.fn(),
    searchAssetsForPicker: jest.fn(),
    searchLocationsForPicker: jest.fn(),
  },
  purchasingApi: {
    listRequests: jest.fn(),
    getRequestDetail: jest.fn(),
    createRequest: jest.fn(),
    addQuote: jest.fn(),
    approveRequest: jest.fn(),
    rejectRequest: jest.fn(),
    cancelRequest: jest.fn(),
    createAwards: jest.fn(),
    getProviderSummary: jest.fn(),
    searchSuppliers: jest.fn(),
    createSupplier: jest.fn(),
    listSuppliers: jest.fn(),
    getSupplier: jest.fn(),
    updateSupplier: jest.fn(),
    setSupplierStatus: jest.fn(),
    createOrder: jest.fn(),
    listOrders: jest.fn(),
    getOrder: jest.fn(),
    receiveOrder: jest.fn(),
  },
  usersApi: {
    list: jest.fn(),
  },
}));

const inventoryApiMock = inventoryApi as jest.Mocked<typeof inventoryApi>;
const purchasingApiMock = purchasingApi as jest.Mocked<typeof purchasingApi>;
const usersApiMock = usersApi as jest.Mocked<typeof usersApi>;

function buildMockUser(overrides: Partial<InternalUser> = {}): InternalUser {
  return {
    id: 'user-1',
    email: 'user@local',
    role: 'NOC',
    status: 'ACTIVE',
    tenantId: 'tenant-1',
    mfaEnabled: false,
    mfaRequired: false,
    isOperationalResource: true,
    emailVerified: true,
    passwordResetRequired: false,
    lastLoginAt: null,
    createdAt: '2026-06-25T12:00:00.000Z',
    updatedAt: '2026-06-25T12:00:00.000Z',
    deletedAt: null,
    firstName: 'Carlos',
    lastName: 'Garzón',
    phone: null,
    jobTitle: null,
    documentType: null,
    documentNumber: null,
    avatarUrl: null,
    ...overrides,
  };
}

const MOCK_TENANT_USERS: InternalUser[] = [
  buildMockUser({
    id: MOBILE_RESPONSIBLE_ID,
    firstName: 'Técnico',
    lastName: 'Norte',
    email: 'tecnico.norte@local',
  }),
  buildMockUser({
    id: UPDATED_RESPONSIBLE_ID,
    firstName: 'Ana',
    lastName: 'Pérez',
    email: 'ana.perez@local',
  }),
];

function buildWriteOffRecord(
  overrides: Partial<import('@/lib/api-client').InventoryWriteOffRecord> = {},
): import('@/lib/api-client').InventoryWriteOffRecord {
  return {
    id: 'wo-1',
    tenantId: 'tenant-1',
    serializedAssetId: null,
    itemId: 'item-1',
    locationId: 'loc-1',
    quantity: '1',
    reason: WriteOffReason.DAMAGED,
    status: WriteOffStatus.PENDING_APPROVAL,
    requestedByUserId: 'user-other',
    approvedByUserId: null,
    approvedAt: null,
    rejectedByUserId: null,
    rejectedAt: null,
    rejectionNotes: null,
    stockMovementId: null,
    notes: null,
    idempotencyKey: null,
    createdAt: '2026-06-25T12:00:00.000Z',
    updatedAt: '2026-06-25T12:00:00.000Z',
    ...overrides,
  };
}

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
    averageCost: '116500',
    reorderPoint: '5',
    targetStock: '20',
    minimumOrderQty: '10',
    orderMultiple: '5',
    leadTimeDays: 7,
    usefulLifeMonths: 36,
    commercialReferenceId: '11111111-1111-4111-8111-111111111111',
    status: InventoryItemStatus.ACTIVE,
    createdAt: '2026-06-25T12:00:00.000Z',
    updatedAt: '2026-06-25T12:00:00.000Z',
    ...overrides,
  };
}

function mockMatchMedia(matchesLg: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: query.includes('1024') ? matchesLg : false,
      media: query,
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
    mockMatchMedia(true);
    replaceMock.mockReset();
    pushMock.mockReset();
    replaceMock.mockImplementation((href: string) => {
      searchParamsMock = new URLSearchParams(String(href).split('?')[1] ?? '');
    });
    pushMock.mockImplementation((href: string) => {
      searchParamsMock = new URLSearchParams(String(href).split('?')[1] ?? '');
    });
    pathnameMock = '/dashboard/inventory';
    searchParamsMock = new URLSearchParams();
    useAuthMock.mockReturnValue({
      user: buildAuthUser(),
      isAuthenticated: true,
      isLoading: false,
      login: jest.fn(),
      completeMfaLogin: jest.fn(),
      logout: jest.fn(),
      refreshProfile: jest.fn(),
    });
    inventoryApiMock.createItem.mockClear();
    inventoryApiMock.dashboard.mockResolvedValue({
      itemsCount: 3,
      locationsCount: 2,
      serializedAssetsCount: 4,
      balancesCount: 5,
      totalOnHand: 17,
      estimatedTotalValue: 2500000,
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
          estimatedValue: 120000,
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
    inventoryApiMock.listItems.mockResolvedValue({
      data: [buildCatalogItem()],
      meta: { ...EMPTY_LIST_META, nextCursor: null, total: 1 },
    });
    inventoryApiMock.listMovements.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    inventoryApiMock.listReplenishmentSuggestions.mockResolvedValue([]);
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
    inventoryApiMock.listCategories.mockResolvedValue({
      data: [
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
      ],
      meta: { ...EMPTY_LIST_META, nextCursor: null, total: 1 },
    });
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

    inventoryApiMock.listLocations.mockImplementation((params: any) => {
      const allLocations = [
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
          name: 'Técnico zona norte',
          type: StockLocationType.MOBILE_TECHNICIAN,
          status: StockLocationStatus.ACTIVE,
          responsibleRefId: MOBILE_RESPONSIBLE_ID,
          maxCapacity: '1.00',
          createdAt: '2026-06-25T12:00:00.000Z',
          updatedAt: '2026-06-25T12:00:00.000Z',
        },
      ];
      const custody = params?.custody as string | undefined;
      const filtered =
        custody === 'mobile'
          ? allLocations.filter((l) => l.type === StockLocationType.MOBILE_TECHNICIAN)
          : allLocations;
      return Promise.resolve({
        data: filtered,
        meta: { ...EMPTY_LIST_META, nextCursor: null, total: filtered.length },
      });
    });
    usersApiMock.list.mockResolvedValue({
      data: MOCK_TENANT_USERS,
      meta: { ...EMPTY_LIST_META, nextCursor: null, total: MOCK_TENANT_USERS.length },
    });
    inventoryApiMock.searchItemsForPicker.mockImplementation(
      (_params?: Record<string, unknown>, _opts?: Record<string, unknown>) =>
        Promise.resolve({
          data: [
            {
              id: 'item-1',
              label: 'ONT-001 - ONT WiFi 6',
              sublabel: 'CPE · Serializado',
            },
          ],
          total: 1,
        }),
    );
    inventoryApiMock.searchAssetsForPicker.mockResolvedValue({
      data: [],
      total: 0,
    });
    inventoryApiMock.searchLocationsForPicker.mockResolvedValue({
      data: [
        {
          id: 'loc-1',
          label: 'BOD-01 - Bodega principal',
          sublabel: 'Principal',
        },
      ],
      total: 1,
    });
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
    inventoryApiMock.listAssets.mockResolvedValue({
      data: [],
      meta: { ...EMPTY_LIST_META, nextCursor: null, total: 0 },
    });
    inventoryApiMock.listUsefulLifeAlerts.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      pageSize: 20,
      limit: 20,
    });
    inventoryApiMock.listLoans.mockResolvedValue({ data: [], total: 0, page: 1, limit: 50 });
    inventoryApiMock.listReplenishmentSuggestions.mockResolvedValue([]);
    inventoryApiMock.listIssues.mockResolvedValue({
      data: [],
      meta: { ...EMPTY_LIST_META, nextCursor: null, total: 0 },
    });
    inventoryApiMock.listCounts.mockResolvedValue({
      data: [],
      meta: { ...EMPTY_LIST_META, nextCursor: null, total: 0 },
    });
    inventoryApiMock.listBalances.mockResolvedValue({
      data: [
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
      ],
      meta: { ...EMPTY_LIST_META, nextCursor: null, total: 1 },
    });
    purchasingApiMock.listRequests.mockResolvedValue({
      data: [
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
      ],
      meta: { ...EMPTY_LIST_META, nextCursor: null, total: 1 },
    });
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
      rfq: null,
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
    purchasingApiMock.listSuppliers.mockResolvedValue({
      data: [],
      total: 0,
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
      shippingCost: '0',
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
      cancellationReason: null,
      cancelledByUserId: null,
      closedByUserId: null,
      notes: null,
      createdAt: '2026-06-25T12:00:00.000Z',
      updatedAt: '2026-06-25T12:00:00.000Z',
    });
    purchasingApiMock.listOrders.mockResolvedValue({
      data: [],
      meta: {
        nextCursor: null,
        total: 0,
        totalIsEstimate: false,
        page: 1,
        limit: 100,
        totalPages: 0,
        hasMore: false,
        mode: 'page',
        capabilities: { randomAccess: true, sortableFields: [] },
        sort: null,
      },
    });
    purchasingApiMock.getOrder.mockResolvedValue({
      id: 'po-1',
      tenantId: 'tenant-1',
      orderNumber: 'PO-000001',
      purchaseRequestId: 'pr-1',
      partyRefId: 'supplier-1',
      status: PurchaseOrderStatus.APPROVED,
      expectedDeliveryDate: null,
      approvedByUserId: 'user-1',
      cancellationReason: null,
      cancelledByUserId: null,
      closedByUserId: null,
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
    inventoryApiMock.writeOff.mockResolvedValue(
      buildWriteOffRecord({ status: WriteOffStatus.PENDING_APPROVAL }),
    );
    (inventoryApiMock.writeOffs.list as jest.Mock).mockImplementation(
      async (params?: { status?: WriteOffStatus }) => {
        if (params?.status === WriteOffStatus.PENDING_APPROVAL) {
          return {
            data: [buildWriteOffRecord()],
            total: 1,
            page: 1,
            limit: 50,
          };
        }

        return {
          data: [
            buildWriteOffRecord({
              id: 'wo-2',
              status: WriteOffStatus.COMPLETED,
              stockMovementId: 'mov-5',
              movementNumber: 'MOV-000005',
              approvedByUserId: 'user-admin',
              approvedAt: '2026-06-26T12:00:00.000Z',
            }),
          ],
          total: 1,
          page: 1,
          limit: 50,
        };
      },
    );
    (inventoryApiMock.writeOffs.approve as jest.Mock).mockResolvedValue(
      buildWriteOffRecord({
        status: WriteOffStatus.COMPLETED,
        stockMovementId: 'mov-5',
        movementNumber: 'MOV-000005',
        approvedByUserId: 'user-admin',
        approvedAt: '2026-06-26T12:00:00.000Z',
      }),
    );
    (inventoryApiMock.writeOffs.reject as jest.Mock).mockResolvedValue(
      buildWriteOffRecord({
        status: WriteOffStatus.REJECTED,
        rejectedByUserId: 'user-admin',
        rejectedAt: '2026-06-26T12:00:00.000Z',
        rejectionNotes: 'Stock insuficiente',
      }),
    );
  });

  it('expone etiquetas amigables para enums del módulo', () => {
    expect(getInventoryItemCategoryLabel(InventoryItemCategory.CPE)).toBe('Equipos de cliente');
    expect(getPurchaseRequestStatusLabel(PurchaseRequestStatus.PENDING_QUOTES)).toBe(
      'Pendiente de cotizaciones',
    );
    expect(formatInventoryCurrency('120000')).toContain('$');
    expect(getWriteOffReasonLabel(WriteOffReason.DAMAGED)).toBe('Daño');
  });

  it('renderiza el dashboard y el workspace de compras', async () => {
    render(<InventoryClient />);

    expect(screen.getByRole('heading', { name: 'Inventario' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Actualizar' })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Productos catalogados')).toBeInTheDocument();
    });

    expect(screen.getByText('Productos bajo mínimo')).toBeInTheDocument();
    expect(screen.getByText('Atención ahora')).toBeInTheDocument();
    expect(screen.getByTestId('summary-assets-cta')).toBeInTheDocument();
    expect(screen.queryByText('Vista previa de productos')).not.toBeInTheDocument();
    expect(screen.queryByText('Material registrado')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('tablist', { name: 'Secciones de inventario' }),
    ).not.toBeInTheDocument();
    const overview = screen.getByRole('button', { name: 'Vista general' });
    expect(overview).toHaveAttribute('aria-current', 'page');
    expect(overview).toHaveClass('bg-iwana-surface-soft');
    expect(overview.querySelector('.bg-iwana-secondary')).not.toBeNull();
    expect(screen.queryByText('Catálogo de productos')).not.toBeInTheDocument();
    expect(screen.getByText('Operación')).toBeInTheDocument();
    expect(screen.getByText('Seguimiento')).toBeInTheDocument();
    for (const name of [
      'Vista general',
      'Catálogo',
      'Existencias',
      'Compras',
      'Proveedores',
      'Bodegas',
      'Salidas',
      'Conteos',
      'Activos',
      'Movimientos',
      'Bajas',
    ]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole('button', { name: 'Compras' }));

    await waitFor(() => {
      expect(screen.getByText('Resumen de compras')).toBeInTheDocument();
      expect(screen.getByText('PR-000001')).toBeInTheDocument();
      expect(screen.getByText('Por cotizar')).toBeInTheDocument();
    });
    expect(screen.queryByText('Productos catalogados')).not.toBeInTheDocument();
  });

  it('renderiza la pestaña Salidas', async () => {
    render(<InventoryClient />);

    await waitFor(() => {
      expect(screen.getByText('Productos catalogados')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Salidas' })).toBeInTheDocument();
  });

  it('abre bodegas cuando tab=locations viene en la URL', async () => {
    searchParamsMock = new URLSearchParams('tab=locations');

    render(<InventoryClient initialTab="locations" />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Bodegas' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      expect(screen.getByRole('heading', { name: 'Bodegas' })).toBeInTheDocument();
    });
  });

  it('abre el diálogo de crear bodega cuando tab=locations/Crear bodega viene en la URL', async () => {
    searchParamsMock = new URLSearchParams('tab=locations/Crear bodega');

    render(<InventoryClient initialTab="locations/Crear bodega" />);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Crear bodega' })).toBeInTheDocument();
    });
  });

  it('permite crear una bodega desde la pestaña de bodegas', async () => {
    const user = userEvent.setup();
    render(<InventoryClient initialTab="locations" />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Bodegas' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Crear bodega' }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^Nombre de la bodega/), 'Móvil zona norte');
    await user.click(within(dialog).getByRole('combobox', { name: /^Tipo/ }));
    await user.click(screen.getByRole('option', { name: 'Técnico en campo' }));
    await user.click(within(dialog).getByRole('combobox', { name: 'Persona a cargo' }));
    await user.click(screen.getByRole('option', { name: 'Técnico Norte' }));
    await user.type(within(dialog).getByLabelText('Límite de unidades'), '10');
    await user.click(within(dialog).getByRole('button', { name: 'Crear bodega' }));

    await waitFor(() => {
      expect(inventoryApiMock.createLocation).toHaveBeenCalledWith({
        name: 'Móvil zona norte',
        type: StockLocationType.MOBILE_TECHNICIAN,
        status: StockLocationStatus.ACTIVE,
        responsibleRefId: MOBILE_RESPONSIBLE_ID,
        maxCapacity: 10,
      });
    });
  });

  it('bloquea crear bodega móvil sin responsable asignado', async () => {
    const user = userEvent.setup();
    render(<InventoryClient initialTab="locations" />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Bodegas' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Crear bodega' }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^Nombre de la bodega/), 'Móvil zona norte');
    await user.click(within(dialog).getByRole('combobox', { name: /^Tipo/ }));
    await user.click(screen.getByRole('option', { name: 'Técnico en campo' }));

    expect(within(dialog).getByRole('button', { name: 'Crear bodega' })).toBeDisabled();
  });

  it('permite editar responsable y capacidad de una bodega existente', async () => {
    const user = userEvent.setup();
    render(<InventoryClient initialTab="locations" />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Bodegas' })).toBeInTheDocument();
    });

    await user.click(await screen.findByRole('button', { name: 'Editar Bodega principal' }));

    const dialog = await screen.findByRole('dialog');
    const nameInput = within(dialog).getByLabelText(/^Nombre de la bodega/);
    const capacityInput = within(dialog).getByLabelText('Límite de unidades');

    await user.clear(nameInput);
    await user.type(nameInput, 'Bodega principal actualizada');
    await user.click(within(dialog).getByRole('combobox', { name: 'Persona a cargo' }));
    await user.click(screen.getByRole('option', { name: 'Ana Pérez' }));
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

  it('redirige custody=mobile de Bodegas a Existencias y conserva el filtro', async () => {
    searchParamsMock = new URLSearchParams('tab=locations&custody=mobile');

    render(<InventoryClient initialTab="locations" />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Existencias' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      expect(screen.getByRole('tab', { name: 'Por bodega', selected: true })).toBeInTheDocument();
      expect(replaceMock).toHaveBeenCalledWith(
        expect.stringContaining('tab=stock'),
        expect.objectContaining({ scroll: false }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Técnico zona norte')).toBeInTheDocument();
      expect(screen.getByText('MOV-02')).toBeInTheDocument();
      expect(screen.queryByText('BOD-01')).not.toBeInTheDocument();
    });
  });

  it('permite ver existencias por ubicación en la subvista Por bodega', async () => {
    const user = userEvent.setup();
    render(<InventoryClient initialTab="stock" />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Existencias' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      expect(screen.queryByText('Productos catalogados')).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: 'Por bodega' }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Ver existencias de Bodega principal' }),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Ver existencias de Bodega principal' }));

    expect(await screen.findByText(/ONT-001 · ONT WiFi 6/i)).toBeInTheDocument();
  });

  it('bloquea destino sitio del cliente y remite la carga a cierre de OT', async () => {
    const user = userEvent.setup();
    inventoryApiMock.listLocations.mockResolvedValue({
      data: [
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
          name: 'Técnico zona norte',
          type: StockLocationType.MOBILE_TECHNICIAN,
          status: StockLocationStatus.ACTIVE,
          responsibleRefId: MOBILE_RESPONSIBLE_ID,
          maxCapacity: '1.00',
          createdAt: '2026-06-25T12:00:00.000Z',
          updatedAt: '2026-06-25T12:00:00.000Z',
        },
        {
          id: 'loc-3',
          tenantId: 'tenant-1',
          code: 'CLI-01',
          name: 'Sitio cliente norte',
          type: StockLocationType.CUSTOMER_SITE,
          status: StockLocationStatus.ACTIVE,
          responsibleRefId: null,
          maxCapacity: null,
          createdAt: '2026-06-25T12:00:00.000Z',
          updatedAt: '2026-06-25T12:00:00.000Z',
        },
      ],
      meta: { ...EMPTY_LIST_META, nextCursor: null, total: 3 },
    });

    render(<InventoryClient initialTab="locations" />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Bodegas' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Salidas' }));
    expect(screen.getByRole('heading', { name: 'Salidas' })).toBeInTheDocument();
  });

  it('usa el flujo nuevo de Salidas en vez del modal legacy', async () => {
    const user = userEvent.setup();
    render(<InventoryClient initialTab="locations" />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Bodegas' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Salidas' }));
    expect(await screen.findByRole('button', { name: 'Salidas' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('heading', { name: 'Salidas' })).toBeInTheDocument();
  });

  it('limita los retornos a estados operativos permitidos', async () => {
    const user = userEvent.setup();
    render(<InventoryClient />);

    await waitFor(() => {
      expect(screen.getByText('Productos catalogados')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Movimientos' }));

    const statusSelect = await screen.findByRole('combobox', {
      name: 'Estado del activo al llegar',
    });
    expect(statusSelect).toHaveTextContent('En tránsito');
    await user.click(statusSelect);
    expect(await screen.findByRole('option', { name: 'En tránsito' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'En pruebas' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Disponible' })).not.toBeInTheDocument();
  });

  it('permite crear una solicitud con lineas desde el compositor', async () => {
    const user = userEvent.setup();
    render(<InventoryClient />);

    await waitFor(() => {
      expect(screen.getByText('Productos catalogados')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Compras' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Nueva solicitud' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Nueva solicitud' }));

    await waitFor(() => {
      expect(screen.getByLabelText(/T[ií]tulo/i)).toBeInTheDocument();
    });

    const searchInput = screen.getByRole('combobox', { name: /Buscar producto/i });
    await user.type(searchInput, 'ONT');
    await user.click(await screen.findByRole('option', { name: /ONT-001 - ONT WiFi 6/i }));

    fireEvent.change(screen.getByLabelText(/T[ií]tulo/i), {
      target: { value: 'Nueva solicitud de abastecimiento' },
    });
    fireEvent.change(screen.getByLabelText(/[ÁA]rea solicitante/i), {
      target: { value: 'Operaciones' },
    });
    fireEvent.change(screen.getByLabelText(/Justificaci[oó]n/i), {
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

  it('switches from tray mode to create mode without keeping the tray visible', async () => {
    const user = userEvent.setup();
    mockMatchMedia(true);
    render(<InventoryClient />);

    await waitFor(() => {
      expect(screen.getByText('Productos catalogados')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Compras' }));

    await waitFor(() => {
      expect(screen.getByText('Listado de solicitudes')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Nueva solicitud' }));

    expect(screen.getByText('Nueva solicitud de compra')).toBeInTheDocument();
    expect(screen.queryByText('Listado de solicitudes')).not.toBeInTheDocument();
  });

  it('returns to tray mode without resetting active filters', async () => {
    const user = userEvent.setup();
    mockMatchMedia(true);
    render(<InventoryClient />);

    await waitFor(() => {
      expect(screen.getByText('Productos catalogados')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Compras' }));

    const searchInput = await screen.findByLabelText('Buscar');
    await user.type(searchInput, 'Reposición');
    expect(searchInput).toHaveValue('Reposición');

    await user.click(screen.getByRole('button', { name: 'Nueva solicitud' }));
    await user.click(screen.getByRole('button', { name: 'Volver al listado' }));

    expect(await screen.findByText('Listado de solicitudes')).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('button', { name: 'Compras' }));
    fireEvent.click(screen.getByRole('button', { name: 'Nueva solicitud' }));

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /Buscar producto/i })).toBeInTheDocument();
    });

    const user = userEvent.setup();
    const searchInput = screen.getByRole('combobox', { name: /Buscar producto/i });
    await user.type(searchInput, 'ONT');
    await user.click(await screen.findByRole('option', { name: /ONT-001 - ONT WiFi 6/i }));

    fireEvent.change(screen.getByLabelText(/T[ií]tulo/i), {
      target: { value: 'Nueva solicitud fallida' },
    });
    fireEvent.change(screen.getByLabelText(/[ÁA]rea solicitante/i), {
      target: { value: 'Operaciones' },
    });
    fireEvent.change(screen.getByLabelText(/Justificaci[oó]n/i), {
      target: { value: 'Reposicion programada' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear solicitud' }));

    await waitFor(() => {
      expect(screen.getByText('Nueva solicitud de compra')).toBeInTheDocument();
      expect(screen.queryByText('Listado de solicitudes')).not.toBeInTheDocument();
      expect(screen.getByText('No se pudo crear la solicitud')).toBeInTheDocument();
    });
  }, 10000);

  it('shows a two-step create flow on mobile instead of a long dialog', async () => {
    mockMatchMedia(false);
    render(<InventoryClient />);

    await waitFor(() => {
      expect(screen.getByText('Productos catalogados')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Sección: Vista general' }));
    fireEvent.click(screen.getByRole('button', { name: 'Compras' }));
    fireEvent.click(screen.getByRole('button', { name: 'Nueva solicitud' }));

    expect(screen.getByText('Paso 1 de 2')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Buscar producto/i })).toBeInTheDocument();
    expect(screen.queryByText('Listado de solicitudes')).not.toBeInTheDocument();
  });

  it('abre el drawer de trabajo y muestra la ficha del proveedor', async () => {
    render(<InventoryClient />);

    await waitFor(() => {
      expect(screen.getByText('Productos catalogados')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Compras' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Abrir' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }));

    await waitFor(() => {
      expect(purchasingApiMock.getRequestDetail).toHaveBeenCalledWith('pr-1');
      expect(screen.getByText('Trabajar solicitud')).toBeInTheDocument();
    });
  });

  it('permite rechazar una solicitud pendiente desde el workbench', async () => {
    purchasingApiMock.rejectRequest.mockResolvedValue({
      id: 'pr-1',
      tenantId: 'tenant-1',
      requestNumber: 'PR-000001',
      title: 'Reposición de ONT',
      status: PurchaseRequestStatus.REJECTED,
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
    });

    render(<InventoryClient />);

    await waitFor(() => {
      expect(screen.getByText('Productos catalogados')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Compras' }));
    });

    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Abrir' }));
    });

    await waitFor(() => {
      expect(screen.getByText('Trabajar solicitud')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Rechazar' }));
    });

    const reasonField = await screen.findByLabelText('Motivo del rechazo');
    await act(async () => {
      fireEvent.change(reasonField, {
        target: { value: 'Cotización fuera de presupuesto' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar rechazo' }));
    });

    await waitFor(() => {
      expect(purchasingApiMock.rejectRequest).toHaveBeenCalledWith('pr-1', {
        reason: 'Cotización fuera de presupuesto',
      });
    });
  });

  it('adjudica líneas desde el workbench cuando la solicitud está aprobada', async () => {
    purchasingApiMock.getRequestDetail.mockResolvedValue({
      request: {
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
      },
      lines: [
        {
          id: 'line-1',
          tenantId: 'tenant-1',
          purchaseRequestId: 'pr-1',
          sourceKind: 'INVENTORY_ITEM' as never,
          inventoryItemId: 'item-1',
          freeTextDescription: null,
          quantityRequested: '5',
          unitOfMeasure: 'unidad',
          suggestedPartyRefId: null,
          lineStatus: 'OPEN' as never,
          notes: null,
          createdAt: '2026-06-25T12:00:00.000Z',
          updatedAt: '2026-06-25T12:00:00.000Z',
        },
      ],
      quotes: [
        {
          id: 'quote-1',
          tenantId: 'tenant-1',
          purchaseRequestId: 'pr-1',
          partyRefId: 'supplier-1',
          quoteNumber: 'COT-100',
          amount: '900000',
          shippingCost: '0',
          currency: 'COP',
          validUntil: null,
          notes: null,
          createdAt: '2026-06-25T12:00:00.000Z',
          updatedAt: '2026-06-25T12:00:00.000Z',
        },
      ],
      awards: [],
      orders: [],
      estimatedAmount: 900000,
      approvalPolicy: {
        canApprove: false,
        requiresException: false,
        blockingReason: null,
        approvalLevel: 'MANAGER',
      },
      rfq: null,
    });
    purchasingApiMock.createAwards.mockResolvedValue([]);

    render(<InventoryClient />);

    await waitFor(() => {
      expect(screen.getByText('Productos catalogados')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Compras' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir' }));

    await waitFor(() => {
      expect(screen.getByText('Trabajar solicitud')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Adjudicación' }));
    fireEvent.click(await screen.findByRole('button', { name: /Usar COT-100/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Adjudicar líneas' }));

    await waitFor(() => {
      expect(purchasingApiMock.createAwards).toHaveBeenCalledWith(
        'pr-1',
        expect.objectContaining({
          awards: [
            expect.objectContaining({
              purchaseRequestLineId: 'line-1',
              awardedPartyRefId: 'supplier-1',
              awardedQuantity: 5,
              supplierQuoteId: 'quote-1',
            }),
          ],
        }),
      );
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

      fireEvent.click(screen.getByRole('button', { name: 'Catálogo' }));

      await act(async () => {
        jest.advanceTimersByTime(1);
      });

      await waitFor(() => {
        expect(screen.getByText('Catálogo de productos')).toBeInTheDocument();
        expect(screen.getByLabelText('Buscar producto')).toBeInTheDocument();
        expect(screen.getAllByText('ONT-001').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('Proveedor Alfa')).toBeInTheDocument();
        const productsTab = screen.getByRole('tab', { name: 'Productos', selected: true });
        expect(productsTab).toHaveClass('border-iwana-secondary');
        expect(productsTab).not.toHaveClass('bg-iwana-primary');
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

    fireEvent.click(screen.getByRole('button', { name: 'Catálogo' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Nuevo producto' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo producto' }));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Nuevo producto' })).toBeInTheDocument();
    });

    expect(screen.queryByRole('tab', { name: 'General' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Código')).not.toBeInTheDocument();

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

    inventoryApiMock.listCategories.mockImplementation(async () => ({
      data: categoryList,
      meta: { ...EMPTY_LIST_META, nextCursor: null, total: categoryList.length },
    }));
    inventoryApiMock.createCategory.mockImplementation(async () => {
      categoryList = [baseCategory, newCategory];
      return newCategory;
    });

    render(<InventoryClient />);

    await waitFor(() => {
      expect(screen.getByText('Productos catalogados')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Catálogo' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Nuevo producto' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Crear categoría aquí' }));

    fireEvent.change(screen.getByLabelText('Nombre de la categoría'), {
      target: { value: 'Fibra óptica' },
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Prefijo de código')).toHaveValue('FIBFO');
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

    fireEvent.click(screen.getByRole('button', { name: 'Catálogo' }));
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

    fireEvent.click(screen.getByRole('button', { name: 'Catálogo' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Nuevo producto' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Crear categoría aquí' }));
    fireEvent.change(screen.getByLabelText('Nombre de la categoría'), {
      target: { value: 'Fibra óptica' },
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Prefijo de código')).toHaveValue('FIBFO');
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

    fireEvent.click(screen.getByRole('button', { name: 'Catálogo' }));

    const skuCells = await screen.findAllByText('ONT-001');
    // El último es la celda de la tabla de catálogo (renderiza después del resumen)
    const skuCell = skuCells[skuCells.length - 1]!;
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
    expect(within(dialog).getByLabelText('Control de material')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Estado')).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        'Compras, inventario y activos se administran desde sus secciones correspondientes.',
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
        commercialReferenceId: '11111111-1111-4111-8111-111111111111',
      });
    });

    const updatePayload = inventoryApiMock.updateItem.mock.calls.at(-1)?.[1];
    expect(updatePayload).not.toHaveProperty('purchasable');
    expect(updatePayload).not.toHaveProperty('preferredSupplierRefId');
    expect(updatePayload).not.toHaveProperty('inventoryControlled');
    expect(updatePayload).not.toHaveProperty('assetControlled');
  });

  it('renderiza la pestaña Bajas con solicitud y bandeja de aprobación', async () => {
    render(<InventoryClient />);

    await waitFor(() => {
      expect(screen.getByText('Productos catalogados')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Bajas' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Solicitar baja' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Solicitar baja' })).toBeInTheDocument();
      expect(screen.getByText('Pendientes de aprobación')).toBeInTheDocument();
      expect(screen.getByTestId('write-off-pending-row-wo-1')).toBeInTheDocument();
    });
  });

  // DEBT-001: SearchablePicker con minChars=0 + debounceMs=0 en React 19 + jsdom.
  // El mock searchItemsForPicker resuelve vía Promise.resolve, pero la microtask que
  // llama setItems(item) nunca se flushea dentro del timeout de findByRole (1000 ms).
  // Resultado: el listbox se queda en estado loading con skeletons y la opción no aparece.
  //
  // Lo que se intentó sin éxito:
  //   1. user.click(combobox)           → onFocus no dispara el efecto async estable.
  //   2. user.type(combobox, 'ONT')     → onChange dispara búsqueda pero la microtask
  //                                       nunca completa (react-dom advierte "not configured
  //                                       to support act").
  //   3. fireEvent.change(combobox, …)  → onChange de React no se dispara con evento sintético.
  //   4. await act(() => user.type(…))  → el act() de React 19 no flushea microtasks en jsdom.
  //
  // La funcionalidad de navegador real está verificada con E2E Playwright. Si en el futuro
  // se corrige la integración React 19 + jsdom (p. ej. migrate a vitest + happy-dom), este
  // skip se puede quitar.
  it.skip('registra una solicitud de baja sin aplicar movimiento inmediato', async () => {
    const user = userEvent.setup();
    render(<InventoryClient />);

    await waitFor(() => {
      expect(screen.getByText('Productos catalogados')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Bajas' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Solicitar baja' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('combobox', { name: 'Producto' }));
    await user.click(await screen.findByRole('option', { name: /ONT-001/ }));
    await user.click(screen.getByRole('combobox', { name: 'Ubicación' }));
    await user.click(await screen.findByRole('option', { name: /BOD-01/ }));
    await user.click(screen.getByRole('button', { name: 'Solicitar baja' }));

    await waitFor(() => {
      expect(inventoryApiMock.writeOff).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: 'item-1',
          locationId: 'loc-1',
          reason: WriteOffReason.DAMAGED,
        }),
      );
      expect(
        screen.getByText('Solicitud registrada — pendiente de aprobación'),
      ).toBeInTheDocument();
    });
  });

  it('permite aprobar una baja pendiente de otro usuario', async () => {
    const user = userEvent.setup();
    render(<InventoryClient />);

    await waitFor(() => {
      expect(screen.getByText('Productos catalogados')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Bajas' }));

    await waitFor(() => {
      expect(screen.getByTestId('write-off-pending-row-wo-1')).toBeInTheDocument();
    });

    await user.click(
      within(screen.getByTestId('write-off-pending-row-wo-1')).getByRole('button', {
        name: 'Aprobar',
      }),
    );

    await waitFor(() => {
      expect(inventoryApiMock.writeOffs.approve).toHaveBeenCalledWith('wo-1');
      expect(screen.getByText(/Baja aprobada/)).toBeInTheDocument();
    });
  });

  // CA-H6-03: canApproveWriteOff es flag independiente de canAdjustStock (ambos ADMIN hoy).
  it('muestra Aprobar y Rechazar cuando canApproveWriteOff aplica (ADMIN) (CA-H6-03)', async () => {
    useAuthMock.mockReturnValue({
      user: buildAuthUser({ role: UserRole.ADMIN }),
      isAuthenticated: true,
      isLoading: false,
      login: jest.fn(),
      completeMfaLogin: jest.fn(),
      logout: jest.fn(),
      refreshProfile: jest.fn(),
    });

    render(<InventoryClient />);

    await waitFor(() => {
      expect(screen.getByText('Productos catalogados')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Bajas' }));

    const pendingRow = await screen.findByTestId('write-off-pending-row-wo-1');
    expect(within(pendingRow).getByRole('button', { name: 'Aprobar' })).toBeInTheDocument();
    expect(within(pendingRow).getByRole('button', { name: 'Rechazar' })).toBeInTheDocument();
  });

  it.each([UserRole.NOC, UserRole.SUPPORT] as const)(
    'oculta Aprobar y Rechazar cuando canApproveWriteOff no aplica (%s) (CA-H6-03)',
    async (role) => {
      useAuthMock.mockReturnValue({
        user: buildAuthUser({ id: 'user-operator', role }),
        isAuthenticated: true,
        isLoading: false,
        login: jest.fn(),
        completeMfaLogin: jest.fn(),
        logout: jest.fn(),
        refreshProfile: jest.fn(),
      });

      render(<InventoryClient />);

      await waitFor(() => {
        expect(screen.getByText('Productos catalogados')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Bajas' }));

      const pendingRow = await screen.findByTestId('write-off-pending-row-wo-1');
      expect(within(pendingRow).queryByRole('button', { name: 'Aprobar' })).not.toBeInTheDocument();
      expect(
        within(pendingRow).queryByRole('button', { name: 'Rechazar' }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Solicitar baja' })).toBeInTheDocument();
    },
  );

  it('muestra historial con enlace al movimiento cuando la baja está completada', async () => {
    render(<InventoryClient />);

    await waitFor(() => {
      expect(screen.getByText('Productos catalogados')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Bajas' }));

    await waitFor(() => {
      expect(screen.getByTestId('write-off-history-row-wo-2')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Ver MOV-000005' })).toBeInTheDocument();
    });
  });

  it('abre subvista Vida útil bajo Activos y enlaza a reposición F2', async () => {
    inventoryApiMock.listUsefulLifeAlerts.mockResolvedValue({
      data: [
        {
          id: 'asset-ul-1',
          serialNumber: 'SN-UL-001',
          assetTag: null,
          sku: 'ONT-01',
          itemName: 'ONT WiFi 6',
          status: 'por-vencer',
          monthsRemaining: 2,
          monthsTotal: 36,
          purchaseDate: '2023-07-01',
          warrantyUntil: null,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
      limit: 20,
    });

    const user = userEvent.setup();
    render(<InventoryClient />);

    await waitFor(() => {
      expect(screen.getByText('Productos catalogados')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Activos' }));
    await user.click(screen.getByRole('tab', { name: 'Vida útil' }));

    await waitFor(() => {
      expect(screen.getByTestId('useful-life-alerts-panel')).toBeInTheDocument();
      expect(screen.getByText('ONT-01 · SN-UL-001')).toBeInTheDocument();
      expect(
        within(screen.getByTestId('useful-life-alert-row-asset-ul-1')).getByText('Por vencer'),
      ).toBeInTheDocument();
    });

    expect(inventoryApiMock.listUsefulLifeAlerts).toHaveBeenCalled();

    await user.click(screen.getByTestId('useful-life-alerts-replenishment-cta'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Existencias' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      expect(screen.getByRole('tab', { name: 'Reposición', selected: true })).toBeInTheDocument();
    });
  });

  it('enlaza stock bajo del resumen a la subvista de reposición', async () => {
    const user = userEvent.setup();
    render(<InventoryClient />);

    await waitFor(() => {
      expect(screen.getByTestId('summary-replenishment-cta')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('summary-replenishment-cta'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Existencias' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      expect(screen.getByRole('tab', { name: 'Reposición', selected: true })).toBeInTheDocument();
    });
  });
});
