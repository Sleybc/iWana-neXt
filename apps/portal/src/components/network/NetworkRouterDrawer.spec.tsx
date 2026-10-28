import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { OrganizationSiteType } from '@iwana/shared';
import type { RouterDto, RouterSiteOptionDto } from '@iwana/shared';
import { emptyPageListMeta } from '@/lib/list-meta';
import { networkApi, tenantSelfApi } from '@/lib/api-client';
import { NetworkRouterDrawer } from './NetworkRouterDrawer';

const router: RouterDto = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Router de prueba',
  managementHost: '198.51.100.12',
  lanInterface: 'bridge-clientes',
  supportedControlMethods: ['SIMPLE_QUEUE_STATIC_IP'],
  organizationSiteId: '22222222-2222-4222-8222-222222222222',
  commercialNodeId: '33333333-3333-4333-8333-333333333333',
  status: 'ACTIVE',
  notes: 'Nota previa',
  networkCount: 0,
  version: 5,
  createdAt: '2026-10-26T12:00:00.000Z',
  updatedAt: '2026-10-26T12:00:00.000Z',
};

describe('NetworkRouterDrawer', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(networkApi, 'listRouterSiteOptions').mockResolvedValue({
      data: [],
      meta: emptyPageListMeta({ page: 1, total: 0, totalPages: 0 }, 100),
    });
    jest.spyOn(tenantSelfApi, 'getCoverage').mockResolvedValue({ nodes: [], zones: [] });
    jest.spyOn(networkApi, 'updateRouter').mockResolvedValue(router);
  });

  it('omite campos no modificados para conservar los valores actuales', async () => {
    render(
      <NetworkRouterDrawer
        open
        canManage
        router={router}
        onClose={jest.fn()}
        onSaved={async () => undefined}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(networkApi.updateRouter).toHaveBeenCalled());

    expect(jest.mocked(networkApi.updateRouter).mock.calls[0]?.[1]).toEqual({
      version: router.version,
    });
  });

  it('envía null al quitar explícitamente la sede física y el nodo comercial', async () => {
    render(
      <NetworkRouterDrawer
        open
        canManage
        router={router}
        onClose={jest.fn()}
        onSaved={async () => undefined}
      />,
    );

    fireEvent.change(await screen.findByLabelText('Sede física'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Nodo comercial'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(networkApi.updateRouter).toHaveBeenCalled());
    expect(jest.mocked(networkApi.updateRouter).mock.calls[0]?.[1]).toMatchObject({
      version: router.version,
      organizationSiteId: null,
      commercialNodeId: null,
    });
    expect(jest.mocked(networkApi.updateRouter).mock.calls[0]?.[1]).not.toHaveProperty('notes');
  });

  it('carga sedes con la ruta de opciones de red y permite avanzar a la página remota siguiente', async () => {
    const firstSite: RouterSiteOptionDto = {
      id: 'site-first',
      name: 'Centro de red',
      siteType: OrganizationSiteType.NOC,
      isActive: true,
    };
    const secondSite: RouterSiteOptionDto = {
      id: 'site-second',
      name: 'Base técnica',
      siteType: OrganizationSiteType.TECH_BASE,
      isActive: false,
    };
    jest
      .mocked(networkApi.listRouterSiteOptions)
      .mockResolvedValueOnce({
        data: [firstSite],
        meta: emptyPageListMeta({ page: 1, total: 101, totalPages: 2, hasMore: true }, 100),
      })
      .mockResolvedValueOnce({
        data: [secondSite],
        meta: emptyPageListMeta({ page: 2, total: 101, totalPages: 2, hasMore: false }, 100),
      });

    render(
      <NetworkRouterDrawer
        open
        canManage
        router={null}
        onClose={jest.fn()}
        onSaved={async () => undefined}
      />,
    );

    const siteSelect = await screen.findByLabelText('Sede física');
    expect(await screen.findByRole('option', { name: /Centro de red/ })).toBeInTheDocument();
    expect(networkApi.listRouterSiteOptions).toHaveBeenNthCalledWith(1, {
      page: 1,
      limit: 100,
    });
    expect(screen.getByRole('option', { name: /Centro de red.*Activa/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cargar más sedes' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('option', { name: /Base técnica.*Inactiva/ }),
      ).not.toBeInTheDocument(),
    );
    expect(siteSelect).toHaveValue('');
    expect(networkApi.listRouterSiteOptions).toHaveBeenNthCalledWith(2, {
      page: 2,
      limit: 100,
    });
  });

  it('mantiene visible pero no seleccionable la sede inactiva ya asociada al editar', async () => {
    const currentInactiveSite: RouterSiteOptionDto = {
      id: router.organizationSiteId as string,
      name: 'Sede actual',
      siteType: OrganizationSiteType.NOC,
      isActive: false,
    };
    jest.mocked(networkApi.listRouterSiteOptions).mockResolvedValueOnce({
      data: [currentInactiveSite],
      meta: emptyPageListMeta({ page: 1, total: 1, totalPages: 1 }, 100),
    });

    render(
      <NetworkRouterDrawer
        open
        canManage
        router={router}
        onClose={jest.fn()}
        onSaved={async () => undefined}
      />,
    );

    const siteSelect = await screen.findByLabelText('Sede física');
    const currentOption = await screen.findByRole('option', { name: /Sede actual.*Inactiva/ });
    expect(siteSelect).toHaveValue(currentInactiveSite.id);
    expect(currentOption).toBeDisabled();
  });

  it('no solicita opciones de sede a una persona sin permiso de gestión', async () => {
    render(
      <NetworkRouterDrawer
        open
        canManage={false}
        router={null}
        onClose={jest.fn()}
        onSaved={async () => undefined}
      />,
    );

    expect(await screen.findByLabelText('Sede física')).toBeDisabled();
    expect(networkApi.listRouterSiteOptions).not.toHaveBeenCalled();
  });

  it('marca el grupo de métodos inválido y conserva el error asociado al retirar la selección', async () => {
    render(
      <NetworkRouterDrawer
        open
        canManage
        router={null}
        onClose={jest.fn()}
        onSaved={async () => undefined}
      />,
    );
    fireEvent.change(await screen.findByLabelText('Nombre del router'), {
      target: { value: 'Router norte' },
    });
    fireEvent.change(screen.getByLabelText('Dirección de administración'), {
      target: { value: '192.0.2.5' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /Cola simple por IP fija/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar router' }));

    const methodsGroup = await screen.findByRole('group', {
      name: 'Métodos de control admitidos',
    });
    expect(methodsGroup).toHaveAttribute('aria-invalid', 'true');
    expect(methodsGroup).toHaveAttribute('aria-describedby');
    expect(screen.getByRole('checkbox', { name: /Cola simple por IP fija/i })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });
});
