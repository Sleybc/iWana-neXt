import { render, screen } from '@testing-library/react';
import { AccessPermissionKey } from '@iwana/shared';
import { usePermissions } from '@/components/access-control/permissions-context';
import { emptyPageListMeta } from '@/lib/list-meta';
import { networkApi, organizationApi, tenantSelfApi } from '@/lib/api-client';
import { useNetworkCatalogQuery } from './use-network-catalog-query';
import { NetworkRouterCatalogClient } from './NetworkRouterCatalogClient';

const mockHasPermission = jest.fn<boolean, [AccessPermissionKey]>();
const mockSetPage = jest.fn();
const mockSetPageSize = jest.fn();
const mockSetSearchDraft = jest.fn();
const mockSetFilter = jest.fn();
const mockClearFilters = jest.fn();

jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: jest.fn(),
}));

jest.mock('./use-network-catalog-query', () => ({
  useNetworkCatalogQuery: jest.fn(),
}));

describe('NetworkRouterCatalogClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHasPermission.mockImplementation((key) => key === AccessPermissionKey.NETWORK_CATALOG_READ);
    (usePermissions as jest.Mock).mockReturnValue({ hasPermission: mockHasPermission });
    (useNetworkCatalogQuery as jest.Mock).mockReturnValue({
      filters: {},
      page: 1,
      pageSize: 20,
      searchDraft: '',
      hasActiveFilters: false,
      setPage: mockSetPage,
      setPageSize: mockSetPageSize,
      setSearchDraft: mockSetSearchDraft,
      setFilter: mockSetFilter,
      clearFilters: mockClearFilters,
    });
    jest.spyOn(networkApi, 'listRouters').mockResolvedValue({
      data: [],
      meta: emptyPageListMeta({ page: 1, total: 0, totalPages: 0 }, 20),
    });
    jest.spyOn(organizationApi, 'list').mockResolvedValue({
      data: [],
      meta: emptyPageListMeta({ page: 1, total: 0, totalPages: 0 }, 100),
    });
    jest.spyOn(tenantSelfApi, 'getCoverage').mockResolvedValue({ nodes: [], zones: [] });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('explica que el catálogo aparecerá cuando se configure si la persona no puede gestionarlo', async () => {
    render(<NetworkRouterCatalogClient />);

    expect(await screen.findByText('Todavía no hay routers registrados.')).toBeInTheDocument();
    expect(
      screen.getByText('La lista aparecerá cuando se configure el catálogo.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Registra un router para asociar sus redes IPv4.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registrar router' })).not.toBeInTheDocument();
  });

  it('invita a registrar un router cuando la persona puede gestionar el catálogo', async () => {
    mockHasPermission.mockImplementation(
      (key) =>
        key === AccessPermissionKey.NETWORK_CATALOG_READ ||
        key === AccessPermissionKey.NETWORK_CATALOG_MANAGE,
    );
    render(<NetworkRouterCatalogClient />);

    expect(await screen.findByText('Todavía no hay routers registrados.')).toBeInTheDocument();
    expect(screen.getByText('Registra un router para asociar sus redes IPv4.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Registrar router' })).toHaveLength(2);
  });
});
