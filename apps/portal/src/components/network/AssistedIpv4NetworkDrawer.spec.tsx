import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type {
  Ipv4NetworkExtendedDto,
  RouterDto,
  RouterInterfaceDto,
  RouterInterfaceIpv4AddressDto,
} from '@iwana/shared';
import { emptyPageListMeta } from '@/lib/list-meta';
import { networkApi } from '@/lib/api-client';
import { AssistedIpv4NetworkDrawer } from './AssistedIpv4NetworkDrawer';

const router: RouterDto = {
  id: 'router-test',
  name: 'Router de prueba',
  managementHost: '198.51.100.12',
  lanInterface: 'bridge-clientes',
  supportedControlMethods: ['SIMPLE_QUEUE_STATIC_IP'],
  organizationSiteId: null,
  commercialNodeId: null,
  status: 'ACTIVE',
  notes: null,
  networkCount: 0,
  version: 1,
  createdAt: '2026-10-26T12:00:00.000Z',
  updatedAt: '2026-10-26T12:00:00.000Z',
};

const routerInterface: RouterInterfaceDto = {
  id: 'interface-test',
  routerId: router.id,
  name: 'bridge-clientes',
  kind: 'BRIDGE',
  notes: null,
  status: 'ACTIVE',
  ipv4AddressCount: 3,
  networkCount: 0,
  version: 1,
  createdAt: '2026-10-26T12:00:00.000Z',
  updatedAt: '2026-10-26T12:00:00.000Z',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function address(
  id: string,
  addressWithPrefix: string,
  host: string,
  prefixLength: number,
): RouterInterfaceIpv4AddressDto {
  return {
    id,
    routerId: router.id,
    interfaceId: routerInterface.id,
    addressWithPrefix,
    host,
    prefixLength,
    notes: null,
    version: 1,
    createdAt: '2026-10-26T12:00:00.000Z',
    updatedAt: '2026-10-26T12:00:00.000Z',
  };
}

const baseNetwork: Ipv4NetworkExtendedDto = {
  id: 'network-test',
  routerId: router.id,
  routerName: router.name,
  name: 'Red clientes',
  cidr: '192.0.2.0/24',
  gateway: '192.0.2.254',
  assignableFrom: '192.0.2.10',
  assignableTo: '192.0.2.200',
  excludedIps: [],
  interfaceId: null,
  interface: null,
  reservationAvailability: { available: true, reason: null },
  defaultControlMethod: 'SIMPLE_QUEUE_STATIC_IP',
  status: 'ACTIVE',
  occupancy: { total: 191, reserved: 0, active: 0, free: 191 },
  version: 1,
  createdAt: '2026-10-26T12:00:00.000Z',
  updatedAt: '2026-10-26T12:00:00.000Z',
};

function page<T>(data: T[]) {
  return {
    data,
    meta: emptyPageListMeta({ page: 1, total: data.length, totalPages: data.length ? 1 : 0 }, 100),
  };
}

describe('AssistedIpv4NetworkDrawer', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(networkApi, 'listRouterInterfaces').mockResolvedValue(page([]));
    jest.spyOn(networkApi, 'getCatalogMeta').mockResolvedValue({ ipProtection: 'PENDING' });
    jest.spyOn(networkApi, 'createAssistedIpv4Network').mockResolvedValue(baseNetwork);
  });

  it('permite capturar bloque y puerta de enlace sin inferirlos de la IP de administración', async () => {
    const onSaved = jest.fn(async () => undefined);
    const onClose = jest.fn();
    render(
      <AssistedIpv4NetworkDrawer open routerContext={router} onClose={onClose} onSaved={onSaved} />,
    );

    expect(
      await screen.findByText(/protección de direcciones de infraestructura está pendiente/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Puerta de enlace')).toHaveValue('');
    expect(screen.queryByDisplayValue(router.managementHost)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Bloque IPv4 (CIDR)'), {
      target: { value: '192.0.2.0/24' },
    });
    fireEvent.change(screen.getByLabelText('Puerta de enlace'), {
      target: { value: '192.0.2.254' },
    });
    fireEvent.change(screen.getByLabelText('Primera dirección asignable'), {
      target: { value: '192.0.2.10' },
    });
    fireEvent.change(screen.getByLabelText('Última dirección asignable'), {
      target: { value: '192.0.2.200' },
    });

    expect(screen.getByText(/Capacidad estimada: 191 direcciones/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar red' }));

    await waitFor(() =>
      expect(networkApi.createAssistedIpv4Network).toHaveBeenCalledWith(
        router.id,
        expect.objectContaining({
          source: {
            mode: 'MANUAL_CIDR',
            cidr: '192.0.2.0/24',
            gateway: '192.0.2.254',
          },
          assignableFrom: '192.0.2.10',
          assignableTo: '192.0.2.200',
        }),
      ),
    );
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('no preselecciona entre varias candidatas y explica las direcciones /32', async () => {
    jest.spyOn(networkApi, 'listRouterInterfaces').mockResolvedValue(page([routerInterface]));
    jest
      .spyOn(networkApi, 'listRouterInterfaceAddresses')
      .mockResolvedValue(
        page([
          address('address-one', '192.0.2.254/24', '192.0.2.254', 24),
          address('address-two', '192.0.2.1/24', '192.0.2.1', 24),
          address('address-host', '192.0.2.7/32', '192.0.2.7', 32),
        ]),
      );
    render(
      <AssistedIpv4NetworkDrawer
        open
        routerContext={router}
        onClose={jest.fn()}
        onSaved={async () => undefined}
      />,
    );

    expect(await screen.findByLabelText('Interfaz asociada')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Interfaz asociada'), {
      target: { value: routerInterface.id },
    });

    const firstCandidate = await screen.findByRole('radio', {
      name: /bridge-clientes · 192\.0\.2\.254\/24/,
    });
    const secondCandidate = screen.getByRole('radio', {
      name: /bridge-clientes · 192\.0\.2\.1\/24/,
    });
    expect(firstCandidate).not.toBeChecked();
    expect(secondCandidate).not.toBeChecked();
    expect(screen.getByText('No define un bloque para los servicios.')).toBeInTheDocument();

    const group = screen.getByRole('group', { name: 'Dirección base de la red' });
    expect(group).toHaveAttribute('aria-describedby');
    expect(group).not.toHaveAttribute('aria-invalid');
    const continueButton = screen.getByRole('button', {
      name: 'Elige la dirección base para continuar',
    });
    expect(continueButton).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(continueButton);
    const summaryAlert = await screen.findByRole('alert');
    expect(summaryAlert).toHaveTextContent(
      'Elige una dirección registrada o cambia a ingreso manual.',
    );
    expect(within(summaryAlert).getByRole('link', { name: /Dirección base/ })).toHaveAttribute(
      'href',
      expect.stringContaining('-source-address-group'),
    );
    await waitFor(() => expect(summaryAlert.parentElement).toHaveFocus());
    expect(
      within(summaryAlert).getByText('Elige una dirección registrada o cambia a ingreso manual.'),
    ).toBeInTheDocument();
    expect(group).toHaveAttribute('aria-invalid', 'true');
    const groupErrorId = group
      .getAttribute('aria-describedby')
      ?.split(' ')
      .find((id) => id.endsWith('-error'));
    expect(groupErrorId).toBeDefined();
    expect(document.getElementById(groupErrorId as string)).toBeVisible();

    fireEvent.click(firstCandidate);
    await waitFor(() =>
      expect(screen.getByLabelText('Bloque IPv4 (CIDR)')).toHaveValue('192.0.2.0/24'),
    );
    expect(screen.getByLabelText('Puerta de enlace')).toHaveValue('192.0.2.254');
    expect(screen.getAllByText('Propuesto desde bridge-clientes · 192.0.2.254/24')).toHaveLength(2);

    fireEvent.click(screen.getByRole('radio', { name: 'Ingresar IP explícita con prefijo' }));
    const explicitAddress = screen.getByLabelText('IP con prefijo');
    fireEvent.change(explicitAddress, { target: { value: '198.51.100.20/24' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Ingresar bloque y puerta de enlace' }));
    fireEvent.change(screen.getByLabelText('Bloque IPv4 (CIDR)'), {
      target: { value: '203.0.113.0/24' },
    });
    fireEvent.click(screen.getByRole('radio', { name: 'Ingresar IP explícita con prefijo' }));

    expect(screen.getByLabelText('IP con prefijo')).toHaveValue('198.51.100.20/24');
    fireEvent.click(screen.getByRole('radio', { name: 'Usar una dirección registrada' }));
    expect(firstCandidate).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'Ingresar bloque y puerta de enlace' }));
    expect(screen.getByLabelText('Bloque IPv4 (CIDR)')).toHaveValue('203.0.113.0/24');
  });

  it('enfoca un resumen de error con enlaces a los campos inválidos', async () => {
    render(
      <AssistedIpv4NetworkDrawer
        open
        routerContext={router}
        onClose={jest.fn()}
        onSaved={async () => undefined}
      />,
    );
    await screen.findByText(/protección de direcciones de infraestructura está pendiente/i);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar red' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Revisa los campos señalados antes de guardar.');
    expect(within(alert).getByRole('link', { name: /Bloque IPv4/ })).toHaveAttribute(
      'href',
      expect.stringContaining('-cidr'),
    );
    expect(within(alert).getByRole('link', { name: /Puerta de enlace/ })).toBeInTheDocument();
    await waitFor(() => expect(alert.parentElement).toHaveFocus());
  });

  it('mantiene acciones locales ocultas cuando la metadata resuelta no incluye ipProtection', async () => {
    jest.spyOn(networkApi, 'getCatalogMeta').mockResolvedValue({} as never);
    render(
      <AssistedIpv4NetworkDrawer
        open
        routerContext={router}
        onClose={jest.fn()}
        onSaved={async () => undefined}
      />,
    );

    expect(
      await screen.findByText(
        /No pudimos verificar la protección de direcciones de infraestructura/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/La protección de direcciones de infraestructura está pendiente/i),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Ingresar bloque y puerta de enlace' })).toBeEnabled();
  });

  it('ignora respuestas de interfaces y direcciones de un router o interfaz anteriores', async () => {
    const secondRouter: RouterDto = { ...router, id: 'router-second', name: 'Router alterno' };
    const firstRouterInterface: RouterInterfaceDto = {
      ...routerInterface,
      id: 'interface-first-router',
      routerId: router.id,
      name: 'Interfaz anterior',
    };
    const secondRouterInterface: RouterInterfaceDto = {
      ...routerInterface,
      id: 'interface-second-router',
      routerId: secondRouter.id,
      name: 'Interfaz actual',
    };
    const alternateInterface: RouterInterfaceDto = {
      ...secondRouterInterface,
      id: 'interface-alternate',
      name: 'Interfaz alternativa',
    };
    const firstRouterInterfaces = deferred<ReturnType<typeof page<RouterInterfaceDto>>>();
    const secondRouterInterfaces = deferred<ReturnType<typeof page<RouterInterfaceDto>>>();
    const firstInterfaceAddresses =
      deferred<ReturnType<typeof page<RouterInterfaceIpv4AddressDto>>>();
    const secondInterfaceAddresses =
      deferred<ReturnType<typeof page<RouterInterfaceIpv4AddressDto>>>();
    jest.spyOn(networkApi, 'listRouterInterfaces').mockImplementation((routerId) => {
      return routerId === router.id
        ? firstRouterInterfaces.promise
        : secondRouterInterfaces.promise;
    });
    jest
      .spyOn(networkApi, 'listRouterInterfaceAddresses')
      .mockImplementation((_routerId, interfaceId) => {
        return interfaceId === secondRouterInterface.id
          ? firstInterfaceAddresses.promise
          : secondInterfaceAddresses.promise;
      });
    const { rerender } = render(
      <AssistedIpv4NetworkDrawer
        open
        routerContext={router}
        onClose={jest.fn()}
        onSaved={async () => undefined}
      />,
    );

    await waitFor(() =>
      expect(networkApi.listRouterInterfaces).toHaveBeenCalledWith(router.id, expect.anything()),
    );
    rerender(
      <AssistedIpv4NetworkDrawer
        open
        routerContext={secondRouter}
        onClose={jest.fn()}
        onSaved={async () => undefined}
      />,
    );
    await waitFor(() =>
      expect(networkApi.listRouterInterfaces).toHaveBeenCalledWith(
        secondRouter.id,
        expect.anything(),
      ),
    );

    await act(async () => firstRouterInterfaces.resolve(page([firstRouterInterface])));
    expect(screen.queryByRole('option', { name: /Interfaz anterior/ })).not.toBeInTheDocument();
    await act(async () =>
      secondRouterInterfaces.resolve(page([secondRouterInterface, alternateInterface])),
    );

    const interfaceSelect = await screen.findByLabelText('Interfaz asociada');
    fireEvent.change(interfaceSelect, { target: { value: secondRouterInterface.id } });
    await waitFor(() =>
      expect(networkApi.listRouterInterfaceAddresses).toHaveBeenCalledWith(
        secondRouter.id,
        secondRouterInterface.id,
        expect.anything(),
      ),
    );
    fireEvent.change(interfaceSelect, { target: { value: alternateInterface.id } });
    await waitFor(() =>
      expect(networkApi.listRouterInterfaceAddresses).toHaveBeenCalledWith(
        secondRouter.id,
        alternateInterface.id,
        expect.anything(),
      ),
    );

    const staleAddress: RouterInterfaceIpv4AddressDto = {
      ...address('stale-address', '192.0.2.10/24', '192.0.2.10', 24),
      routerId: secondRouter.id,
      interfaceId: secondRouterInterface.id,
    };
    const currentAddress: RouterInterfaceIpv4AddressDto = {
      ...address('current-address', '203.0.113.20/24', '203.0.113.20', 24),
      routerId: secondRouter.id,
      interfaceId: alternateInterface.id,
    };
    await act(async () => firstInterfaceAddresses.resolve(page([staleAddress])));
    expect(screen.queryByRole('radio', { name: /192\.0\.2\.10\/24/ })).not.toBeInTheDocument();
    await act(async () => secondInterfaceAddresses.resolve(page([currentAddress])));

    expect(
      await screen.findByRole('radio', { name: /Interfaz alternativa · 203\.0\.113\.20\/24/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /192\.0\.2\.10\/24/ })).not.toBeInTheDocument();
  });
});
