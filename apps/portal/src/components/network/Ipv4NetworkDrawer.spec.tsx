import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Ipv4NetworkExtendedDto, RouterInterfaceDto } from '@iwana/shared';
import { emptyPageListMeta } from '@/lib/list-meta';
import { networkApi } from '@/lib/api-client';
import { Ipv4NetworkDrawer } from './Ipv4NetworkDrawer';

const currentInterface: RouterInterfaceDto = {
  id: '22222222-2222-4222-8222-222222222222',
  routerId: '11111111-1111-4111-8111-111111111111',
  name: 'bridge-clientes',
  kind: 'BRIDGE',
  notes: null,
  status: 'ACTIVE',
  ipv4AddressCount: 1,
  networkCount: 1,
  version: 2,
  createdAt: '2026-10-26T12:00:00.000Z',
  updatedAt: '2026-10-26T12:00:00.000Z',
};

const nextInterface: RouterInterfaceDto = {
  ...currentInterface,
  id: '33333333-3333-4333-8333-333333333333',
  name: 'ethernet-clientes',
  networkCount: 0,
  version: 4,
};

const network: Ipv4NetworkExtendedDto = {
  id: '44444444-4444-4444-8444-444444444444',
  routerId: '11111111-1111-4111-8111-111111111111',
  routerName: 'Router de prueba',
  name: 'Red clientes',
  cidr: '192.0.2.0/24',
  gateway: '192.0.2.254',
  assignableFrom: '192.0.2.10',
  assignableTo: '192.0.2.200',
  excludedIps: [],
  interfaceId: currentInterface.id,
  interface: { id: currentInterface.id, name: currentInterface.name, status: 'ACTIVE' },
  reservationAvailability: { available: true, reason: null },
  defaultControlMethod: 'SIMPLE_QUEUE_STATIC_IP',
  status: 'ACTIVE',
  occupancy: { total: 191, reserved: 0, active: 0, free: 191 },
  version: 3,
  createdAt: '2026-10-26T12:00:00.000Z',
  updatedAt: '2026-10-26T12:00:00.000Z',
};

describe('Ipv4NetworkDrawer', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(networkApi, 'listRouterInterfaces').mockResolvedValue({
      data: [currentInterface, nextInterface],
      meta: emptyPageListMeta({ page: 1, total: 2, totalPages: 1 }, 100),
    });
    jest.spyOn(networkApi, 'updateIpv4Network').mockResolvedValue(network);
  });

  it('omite la asociación de interfaz en PATCH cuando no se modifica', async () => {
    render(
      <Ipv4NetworkDrawer
        open
        network={network}
        onClose={jest.fn()}
        onSaved={async () => undefined}
      />,
    );

    expect(await screen.findByRole('option', { name: /ethernet-clientes/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(networkApi.updateIpv4Network).toHaveBeenCalled());
    const body = jest.mocked(networkApi.updateIpv4Network).mock.calls[0]?.[1];
    expect(body).not.toHaveProperty('interfaceId');
    expect(body).not.toHaveProperty('interfaceVersion');
  });

  it('envía null para quitar una asociación de interfaz de forma explícita', async () => {
    render(
      <Ipv4NetworkDrawer
        open
        network={network}
        onClose={jest.fn()}
        onSaved={async () => undefined}
      />,
    );

    const selector = await screen.findByLabelText('Interfaz asociada');
    fireEvent.change(selector, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(networkApi.updateIpv4Network).toHaveBeenCalled());
    const body = jest.mocked(networkApi.updateIpv4Network).mock.calls[0]?.[1];
    expect(body).toMatchObject({ interfaceId: null });
    expect(body).not.toHaveProperty('interfaceVersion');
  });

  it('incluye la versión vigente al asociar otra interfaz', async () => {
    render(
      <Ipv4NetworkDrawer
        open
        network={network}
        onClose={jest.fn()}
        onSaved={async () => undefined}
      />,
    );

    const selector = await screen.findByLabelText('Interfaz asociada');
    expect(await screen.findByRole('option', { name: /ethernet-clientes/ })).toBeInTheDocument();
    fireEvent.change(selector, { target: { value: nextInterface.id } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(networkApi.updateIpv4Network).toHaveBeenCalled());
    expect(jest.mocked(networkApi.updateIpv4Network).mock.calls[0]?.[1]).toMatchObject({
      interfaceId: nextInterface.id,
      interfaceVersion: nextInterface.version,
    });
  });
});
