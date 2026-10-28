import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRef, useState } from 'react';
import type {
  Ipv4NetworkExtendedDto,
  RouterDetailDto,
  RouterInterfaceDto,
  RouterInterfaceIpv4AddressDto,
} from '@iwana/shared';
import { emptyPageListMeta } from '@/lib/list-meta';
import { networkApi } from '@/lib/api-client';
import { NetworkRouterDetailSidePeek } from './NetworkRouterDetailSidePeek';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const router: RouterDetailDto = {
  id: 'router-test',
  name: 'Router de prueba',
  managementHost: '198.51.100.12',
  lanInterface: 'bridge-clientes',
  supportedControlMethods: ['SIMPLE_QUEUE_STATIC_IP'],
  organizationSiteId: null,
  commercialNodeId: null,
  organizationSite: null,
  commercialNode: null,
  status: 'ACTIVE',
  notes: null,
  networkCount: 0,
  interfaceCount: 1,
  legacyLanInterfaceId: null,
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
  ipv4AddressCount: 1,
  networkCount: 0,
  version: 1,
  createdAt: '2026-10-26T12:00:00.000Z',
  updatedAt: '2026-10-26T12:00:00.000Z',
};

const address: RouterInterfaceIpv4AddressDto = {
  id: 'address-test',
  routerId: router.id,
  interfaceId: routerInterface.id,
  addressWithPrefix: '192.0.2.254/24',
  host: '192.0.2.254',
  prefixLength: 24,
  notes: null,
  version: 1,
  createdAt: '2026-10-26T12:00:00.000Z',
  updatedAt: '2026-10-26T12:00:00.000Z',
};

function page<T>(data: T[]) {
  return {
    data,
    meta: emptyPageListMeta({ page: 1, total: data.length, totalPages: data.length ? 1 : 0 }, 20),
  };
}

function SidePeekFocusHarness({ initiallyOpen }: { initiallyOpen: boolean }) {
  const [routerId, setRouterId] = useState<string | null>(initiallyOpen ? router.id : null);
  const listHeadingRef = useRef<HTMLHeadingElement | null>(null);

  return (
    <>
      <h1 ref={listHeadingRef} tabIndex={-1}>
        Routers
      </h1>
      {!initiallyOpen ? (
        <button type="button" onClick={() => setRouterId(router.id)}>
          Abrir detalle
        </button>
      ) : null}
      <NetworkRouterDetailSidePeek
        routerId={routerId}
        canManage
        returnFocusFallbackRef={listHeadingRef}
        onOpenChange={(open) => {
          if (!open) setRouterId(null);
        }}
      />
    </>
  );
}

describe('NetworkRouterDetailSidePeek', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(networkApi, 'getRouter').mockResolvedValue(router);
    jest.spyOn(networkApi, 'listRouterInterfaces').mockResolvedValue(page([routerInterface]));
    jest.spyOn(networkApi, 'listRouterInterfaceAddresses').mockResolvedValue(page([address]));
    jest.spyOn(networkApi, 'listIpv4Networks').mockResolvedValue(page<Ipv4NetworkExtendedDto>([]));
    jest.spyOn(networkApi, 'getCatalogMeta').mockResolvedValue({ ipProtection: 'PENDING' });
  });

  it('mantiene disponible el catálogo de interfaces y oculta captura o corrección de IP local mientras está pendiente', async () => {
    render(<NetworkRouterDetailSidePeek routerId={router.id} canManage onOpenChange={jest.fn()} />);

    expect(await screen.findByRole('button', { name: 'Añadir interfaz' })).toBeInTheDocument();
    expect(
      screen.getByText(/Todavía no puedes registrar ni cambiar direcciones locales/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver direcciones (1)' }));

    expect(await screen.findByText(address.addressWithPrefix)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Añadir dirección' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Corregir dirección' })).not.toBeInTheDocument();
    expect(
      screen.queryByText(/La protección de direcciones de infraestructura está activa/i),
    ).not.toBeInTheDocument();
  });

  it('mantiene ocultas las acciones de dirección y no afirma estado pendiente con metadata incompleta', async () => {
    jest.spyOn(networkApi, 'getCatalogMeta').mockResolvedValue({} as never);
    render(<NetworkRouterDetailSidePeek routerId={router.id} canManage onOpenChange={jest.fn()} />);

    expect(
      await screen.findByText(
        /No pudimos verificar si las direcciones de infraestructura están protegidas/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Todavía no puedes registrar ni cambiar direcciones locales/i),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Añadir interfaz' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Añadir dirección' })).not.toBeInTheDocument();
  });

  it('asocia y anuncia un error claro al convertir una referencia LAN sin seleccionar clase', async () => {
    jest.spyOn(networkApi, 'getRouter').mockResolvedValue({
      ...router,
      lanInterface: 'ether1',
      legacyLanInterfaceId: null,
    });
    render(<NetworkRouterDetailSidePeek routerId={router.id} canManage onOpenChange={jest.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Convertir en interfaz' }));
    const kindField = screen.getByLabelText('Clase de interfaz');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar interfaz' }));

    const kindError = await screen.findByRole('alert');
    expect(kindError).toHaveTextContent('Selecciona una clase de interfaz.');
    expect(kindField).toHaveAttribute('aria-invalid', 'true');
    expect(kindField).toHaveAttribute('aria-describedby', 'router-interface-convert-kind-error');
    expect(screen.queryByText(/Invalid (enum value|option)/i)).not.toBeInTheDocument();
  });

  it('devuelve el foco al encabezado cuando el detalle se abrió desde una URL directa', async () => {
    render(<SidePeekFocusHarness initiallyOpen />);

    await screen.findByRole('button', { name: 'Añadir interfaz' });
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Routers' })).toHaveFocus());
  });

  it('devuelve el foco a la fila de origen cuando el detalle se abrió desde la lista', async () => {
    render(<SidePeekFocusHarness initiallyOpen={false} />);
    const trigger = screen.getByRole('button', { name: 'Abrir detalle' });
    trigger.focus();
    fireEvent.click(trigger);

    await screen.findByRole('button', { name: 'Añadir interfaz' });
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));

    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('bloquea Escape, el botón de cierre y el velo mientras guarda una mutación', async () => {
    const onOpenChange = jest.fn();
    let resolveCreate: (value: RouterInterfaceDto) => void = () => undefined;
    jest.spyOn(networkApi, 'createRouterInterface').mockImplementation(
      () =>
        new Promise<RouterInterfaceDto>((resolve) => {
          resolveCreate = resolve;
        }),
    );
    render(
      <NetworkRouterDetailSidePeek routerId={router.id} canManage onOpenChange={onOpenChange} />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Añadir interfaz' }));
    fireEvent.change(screen.getByLabelText('Nombre de la interfaz'), {
      target: { value: 'uplink-norte' },
    });
    fireEvent.change(screen.getByLabelText('Clase de interfaz'), {
      target: { value: 'PHYSICAL' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar interfaz' }));
    await waitFor(() => expect(networkApi.createRouterInterface).toHaveBeenCalled());

    const closeButton = screen.getByRole('button', { name: 'Cerrar' });
    expect(closeButton).toBeDisabled();
    fireEvent.keyDown(document, { key: 'Escape' });
    const veil = document.querySelector<HTMLElement>('[data-portal-veil]');
    expect(veil).not.toBeNull();
    if (veil) fireEvent.mouseDown(veil);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    resolveCreate({
      ...routerInterface,
      id: 'interface-created',
      name: 'uplink-norte',
      kind: 'PHYSICAL',
      ipv4AddressCount: 0,
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cerrar' })).toBeEnabled());
  });
});
