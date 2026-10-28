import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AccessPermissionKey } from '@iwana/shared';
import type { RouterDto, RouterListDto } from '@iwana/shared';
import { usePermissions } from '@/components/access-control/permissions-context';
import { emptyPageListMeta } from '@/lib/list-meta';
import { networkApi, tenantSelfApi } from '@/lib/api-client';
import { useNetworkCatalogQuery } from './use-network-catalog-query';
import { NetworkRouterCatalogClient } from './NetworkRouterCatalogClient';

const mockHasPermission = jest.fn<boolean, [AccessPermissionKey]>();
const mockSetPage = jest.fn();
const mockSetPageSize = jest.fn();
const mockSetSearchDraft = jest.fn();
const mockSetFilter = jest.fn();
const mockClearFilters = jest.fn();
const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();
const mockRouterBack = jest.fn();

function buildRouter(overrides: Partial<RouterListDto> = {}): RouterListDto {
  return {
    id: 'router-test',
    name: 'Router de prueba',
    managementHost: '192.0.2.5',
    lanInterface: 'bridge-clientes',
    supportedControlMethods: ['SIMPLE_QUEUE_STATIC_IP'],
    organizationSiteId: null,
    commercialNodeId: null,
    status: 'ACTIVE',
    notes: null,
    networkCount: 0,
    interfaceCount: 0,
    legacyLanInterfaceId: null,
    version: 1,
    createdAt: '2026-10-26T12:00:00.000Z',
    updatedAt: '2026-10-26T12:00:00.000Z',
    ...overrides,
  };
}

function routerPage(router: RouterListDto) {
  return {
    data: [router],
    meta: emptyPageListMeta({ page: 1, total: 1, totalPages: 1 }, 20),
  };
}

jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockRouterPush,
    replace: mockRouterReplace,
    back: mockRouterBack,
  }),
  usePathname: () => '/dashboard/network/routers',
  useSearchParams: () => new URLSearchParams(),
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
    jest.spyOn(networkApi, 'listRouterSiteOptions').mockResolvedValue({
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

  it('muestra la acción visible y la actualiza al desactivar y volver a activar el router', async () => {
    mockHasPermission.mockReturnValue(true);
    let router = buildRouter();
    jest.mocked(networkApi.listRouters).mockImplementation(async () => routerPage(router));
    const setStatus = jest
      .spyOn(networkApi, 'setRouterStatus')
      .mockImplementation(async (_id, version, status) => {
        router = { ...router, status, version: version + 1 };
        return router;
      });
    render(<NetworkRouterCatalogClient />);

    const deactivate = await screen.findByRole('button', {
      name: 'Desactivar router Router de prueba',
    });
    expect(deactivate).toHaveTextContent('Desactivar');
    fireEvent.click(deactivate);

    const activate = await screen.findByRole('button', {
      name: 'Activar router Router de prueba',
    });
    expect(activate).toHaveTextContent('Activar');
    expect(setStatus).toHaveBeenNthCalledWith(1, router.id, 1, 'INACTIVE');
    expect(
      within(screen.getByRole('row', { name: /Router de prueba/ })).getByText('Inactivo'),
    ).toBeInTheDocument();
    fireEvent.click(activate);

    expect(
      await screen.findByRole('button', { name: 'Desactivar router Router de prueba' }),
    ).toHaveTextContent('Desactivar');
    expect(setStatus).toHaveBeenNthCalledWith(2, router.id, 2, 'ACTIVE');
    expect(
      within(screen.getByRole('row', { name: /Router de prueba/ })).getByText('Activo'),
    ).toBeInTheDocument();
  });

  it('bloquea el botón mientras se guarda y conserva el estado si la operación falla', async () => {
    mockHasPermission.mockReturnValue(true);
    const router = buildRouter();
    jest.mocked(networkApi.listRouters).mockResolvedValue(routerPage(router));
    let rejectStatus: (error: Error) => void = () => undefined;
    const setStatus = jest.spyOn(networkApi, 'setRouterStatus').mockImplementation(
      () =>
        new Promise<RouterDto>((_resolve, reject) => {
          rejectStatus = reject;
        }),
    );
    render(<NetworkRouterCatalogClient />);

    const deactivate = await screen.findByRole('button', {
      name: 'Desactivar router Router de prueba',
    });
    fireEvent.click(deactivate);
    expect(deactivate).toBeDisabled();
    fireEvent.click(deactivate);
    expect(setStatus).toHaveBeenCalledTimes(1);

    rejectStatus(new Error('Fallo de prueba'));
    expect(await screen.findByText('No se actualizó el router')).toBeInTheDocument();
    await waitFor(() => expect(deactivate).toBeEnabled());
    expect(deactivate).toHaveTextContent('Desactivar');
    expect(
      within(screen.getByRole('row', { name: /Router de prueba/ })).getByText('Activo'),
    ).toBeInTheDocument();
  });

  it('permite consultar el detalle sin mostrar acciones de gestión a una persona con acceso de lectura', async () => {
    jest.mocked(networkApi.listRouters).mockResolvedValue(routerPage(buildRouter()));
    render(<NetworkRouterCatalogClient />);

    const row = await screen.findByRole('row', { name: /Router de prueba/ });
    expect(within(row).getByText('Activo')).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Ver router' })).toBeInTheDocument();
    expect(
      within(row).queryByRole('button', { name: 'Editar router Router de prueba' }),
    ).not.toBeInTheDocument();
    expect(
      within(row).queryByRole('button', { name: 'Desactivar router Router de prueba' }),
    ).not.toBeInTheDocument();
  });

  it('muestra la asociación con el nodo comercial sin consultar el catálogo de cobertura', async () => {
    const router = buildRouter({ commercialNodeId: 'commercial-node-test' });
    jest.mocked(networkApi.listRouters).mockResolvedValue(routerPage(router));
    render(<NetworkRouterCatalogClient />);

    const row = await screen.findByRole('row', { name: /Router de prueba/ });
    expect(within(row).getByText('Nodo comercial asociado')).toBeInTheDocument();
    expect(tenantSelfApi.getCoverage).not.toHaveBeenCalled();
  });

  it('conserva el router recién guardado al continuar con el registro de su primera red', async () => {
    mockHasPermission.mockReturnValue(true);
    jest
      .mocked(networkApi.listRouters)
      .mockResolvedValueOnce({
        data: [],
        meta: emptyPageListMeta({ page: 1, total: 0, totalPages: 0 }, 20),
      })
      .mockResolvedValue(routerPage(buildRouter()));
    jest.spyOn(networkApi, 'createRouter').mockResolvedValue(buildRouter());
    jest.spyOn(networkApi, 'listRouterInterfaces').mockResolvedValue({
      data: [],
      meta: emptyPageListMeta({ page: 1, total: 0, totalPages: 0 }, 100),
    });
    jest.spyOn(networkApi, 'getCatalogMeta').mockResolvedValue({ ipProtection: 'PENDING' });
    render(<NetworkRouterCatalogClient />);

    fireEvent.click((await screen.findAllByRole('button', { name: 'Registrar router' }))[0]!);
    fireEvent.change(screen.getByLabelText('Nombre del router'), {
      target: { value: 'Router de prueba' },
    });
    fireEvent.change(screen.getByLabelText('Dirección de administración'), {
      target: { value: '192.0.2.5' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar y añadir red' }));

    expect(await screen.findByRole('dialog', { name: 'Registrar red IPv4' })).toBeInTheDocument();
    expect(screen.getByText(/Router: Router de prueba · Activo/)).toBeInTheDocument();
    expect(screen.getByText('Este router aún no tiene interfaces registradas')).toBeInTheDocument();
    expect(networkApi.createRouter).toHaveBeenCalledTimes(1);
  });
});
