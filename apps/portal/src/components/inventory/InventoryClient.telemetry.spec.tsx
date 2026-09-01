// @ts-nocheck
// Telemetría Fase 1 (ADR-084 D5): trackEvent('inventory.tab.view') en
// handleTabChange. Reutiliza el harness canónico de InventoryClient.spec.tsx.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InventoryClient } from './InventoryClient';
import { EMPTY_LIST_META } from '@/lib/list-meta';

const replaceMock = jest.fn();
const pushMock = jest.fn();
let pathnameMock = '/dashboard/inventory';
let searchParamsMock = new URLSearchParams();
const routerMock = {
  replace: (...args: unknown[]) => replaceMock(...args),
  push: (...args: unknown[]) => pushMock(...args),
};

const trackEventMock = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => pathnameMock,
  useRouter: () => routerMock,
  useSearchParams: () => searchParamsMock,
}));

jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => ({
    user: {
      id: 'user-admin',
      emailHash: 'hash',
      role: 'ADMIN',
      type: 'tenant',
      tenantId: 'tenant-1',
      displayName: 'Admin',
      subtitle: 'Administrador',
      firstName: 'Admin',
      lastName: 'Test',
    },
    isAuthenticated: true,
    isLoading: false,
    login: jest.fn(),
    completeMfaLogin: jest.fn(),
    logout: jest.fn(),
    refreshProfile: jest.fn(),
  }),
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
      super(resolvedMessage);
      this.status = typeof statusOrMessage === 'number' ? statusOrMessage : 500;
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

jest.mock('@/lib/analytics', () => ({
  trackEvent: (...args: unknown[]) => trackEventMock(...args),
}));

const inventoryApiMock = jest.requireMock('@/lib/api-client').inventoryApi;
const purchasingApiMock = jest.requireMock('@/lib/api-client').purchasingApi;
const usersApiMock = jest.requireMock('@/lib/api-client').usersApi;

function mockMatchMediaLg() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: query.includes('1024'),
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

const EMPTY_PAGE = { data: [], meta: { ...EMPTY_LIST_META, nextCursor: null, total: 0 } };

describe('InventoryClient telemetría inventory.tab.view', () => {
  beforeEach(() => {
    mockMatchMediaLg();
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
    trackEventMock.mockClear();

    inventoryApiMock.dashboard.mockResolvedValue({
      itemsCount: 0,
      locationsCount: 0,
      serializedAssetsCount: 0,
      balancesCount: 0,
      totalOnHand: 0,
      estimatedTotalValue: 0,
      balancesByLocation: [],
      balancesByCategory: [],
      serializedAssetsByStatus: [],
      serializedAssetsByResponsibleType: [],
    });
    inventoryApiMock.listItems.mockResolvedValue(EMPTY_PAGE);
    inventoryApiMock.listCategories.mockResolvedValue(EMPTY_PAGE);
    inventoryApiMock.listLocations.mockResolvedValue(EMPTY_PAGE);
    inventoryApiMock.listBalances.mockResolvedValue(EMPTY_PAGE);
    inventoryApiMock.listAssets.mockResolvedValue(EMPTY_PAGE);
    inventoryApiMock.listIssues.mockResolvedValue(EMPTY_PAGE);
    inventoryApiMock.listCounts.mockResolvedValue(EMPTY_PAGE);
    inventoryApiMock.writeOffs.list.mockResolvedValue(EMPTY_PAGE);
    inventoryApiMock.listMovements.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    inventoryApiMock.listReplenishmentSuggestions.mockResolvedValue([]);
    purchasingApiMock.listRequests.mockResolvedValue(EMPTY_PAGE);
    purchasingApiMock.listSuppliers.mockResolvedValue(EMPTY_PAGE);
    purchasingApiMock.getProviderSummary.mockResolvedValue({ displayName: 'Proveedor' });
    usersApiMock.list.mockResolvedValue(EMPTY_PAGE);
  });

  async function clickTab(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
    const btn = screen.queryByRole('button', { name }) ?? screen.queryByRole('tab', { name });
    await user.click(btn);
  }

  it('emite trackEvent(inventory.tab.view, {tab}) al cambiar de pestaña', async () => {
    const user = userEvent.setup();
    render(<InventoryClient initialTab="catalog" />);

    await clickTab(user, /Existencias/i);

    expect(trackEventMock).toHaveBeenCalledWith('inventory.tab.view', { tab: 'stock' });
    expect(replaceMock).toHaveBeenCalled();
    const lastCall = replaceMock.mock.calls.at(-1)?.[0] as string;
    expect(lastCall).toContain('tab=stock');
  });

  it('no emite evento en el render inicial (solo en cambio de pestaña)', async () => {
    render(<InventoryClient initialTab="locations" />);

    expect(await screen.findByText('Inventario')).toBeInTheDocument();
    expect(trackEventMock).not.toHaveBeenCalled();
  });

  it('emite tab overview y elimina el parámetro ?tab al volver a Vista general', async () => {
    const user = userEvent.setup();
    render(<InventoryClient initialTab="catalog" />);

    await clickTab(user, /Vista general/i);

    expect(trackEventMock).toHaveBeenCalledWith('inventory.tab.view', { tab: 'overview' });
    const lastCall = replaceMock.mock.calls.at(-1)?.[0] as string;
    expect(lastCall).not.toContain('tab=');
  });

  it('preserva la query existente (custody) al cambiar de pestaña', async () => {
    searchParamsMock = new URLSearchParams('custody=mobile');
    const user = userEvent.setup();
    render(<InventoryClient initialTab="catalog" />);

    await clickTab(user, /Existencias/i);

    const lastCall = replaceMock.mock.calls.at(-1)?.[0] as string;
    expect(lastCall).toContain('tab=stock');
    expect(lastCall).toContain('custody=mobile');
    expect(trackEventMock).toHaveBeenCalledWith('inventory.tab.view', { tab: 'stock' });
  });
});
