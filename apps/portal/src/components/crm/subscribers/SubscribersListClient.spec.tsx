import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ListMeta } from '@iwana/shared';
import { subscribersApi } from '@/lib/api-client';
import { PORTAL_DEFAULT_PAGE_SIZE } from '@/lib/portal-page-size';
import { SubscribersListClient } from './SubscribersListClient';

const pushMock = jest.fn();
const replaceMock = jest.fn();
let searchParamsMock = new URLSearchParams();

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  usePathname: () => '/dashboard/crm/subscribers',
  useSearchParams: () => searchParamsMock,
}));

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    subscribersApi: {
      ...actual.subscribersApi,
      list: jest.fn(),
      search: jest.fn(),
    },
  };
});

const listMock = subscribersApi.list as jest.Mock;

function mockMatchMediaSmUp(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query.includes('640') ? matches : false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }),
  });
}

function subscriberFixture(
  id: string,
  name: { firstName: string; lastName: string },
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    personType: 'NATURAL',
    firstName: name.firstName,
    lastName: name.lastName,
    businessName: null,
    documentType: 'CC',
    documentNumber: id,
    email: `${id}@example.com`,
    phone: null,
    customerSegment: 'RESIDENTIAL',
    vatTreatment: 'STANDARD',
    status: 'ACTIVE',
    city: 'Bogotá',
    department: 'Cundinamarca',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function pageMeta(partial: Partial<ListMeta>): ListMeta {
  const page = partial.page ?? 1;
  const limit = partial.limit ?? PORTAL_DEFAULT_PAGE_SIZE;
  const total = partial.total ?? 0;
  const totalPages = partial.totalPages ?? (limit > 0 ? Math.max(0, Math.ceil(total / limit)) : 0);
  return {
    nextCursor: null,
    total,
    totalIsEstimate: false,
    page,
    limit,
    totalPages,
    hasMore: page < totalPages,
    mode: 'page',
    capabilities: partial.capabilities ?? {
      randomAccess: true,
      sortableFields: [],
    },
    sort: partial.sort ?? null,
  };
}

describe('SubscribersListClient ADR-065', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMatchMediaSmUp(true);
    Element.prototype.scrollIntoView = jest.fn();
    searchParamsMock = new URLSearchParams();
    pushMock.mockImplementation((href: string) => {
      searchParamsMock = new URLSearchParams(String(href).split('?')[1] ?? '');
    });
    replaceMock.mockImplementation((href: string) => {
      searchParamsMock = new URLSearchParams(String(href).split('?')[1] ?? '');
    });
  });

  it('reemplaza la página: página 2 muestra filas distintas (no acumulación)', async () => {
    const page1 = Array.from({ length: 20 }, (_, i) =>
      subscriberFixture(`p1-${i}`, { firstName: 'Ana', lastName: `P${i}` }),
    );
    const page2 = Array.from({ length: 20 }, (_, i) =>
      subscriberFixture(`p2-${i}`, { firstName: 'Luis', lastName: `Q${i}` }),
    );

    listMock.mockImplementation(async (params: { page?: number; limit?: number }) => {
      const page = params.page ?? 1;
      const data = page === 1 ? page1 : page2;
      return {
        data,
        total: 40,
        meta: pageMeta({
          page,
          limit: params.limit ?? 20,
          total: 40,
          totalPages: 2,
          capabilities: { randomAccess: true, sortableFields: [] },
        }),
      };
    });

    const user = userEvent.setup();
    const { rerender } = render(<SubscribersListClient />);

    await waitFor(() => {
      expect(screen.getByText('Ana P0')).toBeInTheDocument();
    });
    expect(screen.queryByText('Luis Q0')).not.toBeInTheDocument();
    expect(listMock).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: PORTAL_DEFAULT_PAGE_SIZE }),
    );
    expect(screen.getAllByText(/Mostrando 1\u201320 de 40 suscriptores/).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(pushMock).toHaveBeenCalled();
    const pushed = String(pushMock.mock.calls[0]?.[0]);
    expect(pushed).toContain('page=2');

    searchParamsMock = new URLSearchParams('page=2');
    rerender(<SubscribersListClient />);

    await waitFor(() => {
      expect(screen.getByText('Luis Q0')).toBeInTheDocument();
    });
    expect(screen.queryByText('Ana P0')).not.toBeInTheDocument();
    expect(listMock).toHaveBeenCalledWith(expect.objectContaining({ page: 2, limit: 20 }));
    expect(screen.getAllByText(/Mostrando 21\u201340 de 40 suscriptores/).length).toBeGreaterThan(
      0,
    );
  });

  it('cambia el tamaño con replace y vuelve a página 1', async () => {
    listMock.mockResolvedValue({
      data: [subscriberFixture('sub-1', { firstName: 'Ana', lastName: 'Pérez' })],
      total: 25,
      meta: pageMeta({
        page: 2,
        limit: 20,
        total: 25,
        totalPages: 2,
      }),
    });

    searchParamsMock = new URLSearchParams('page=2');
    const user = userEvent.setup();
    render(<SubscribersListClient />);

    await waitFor(() => {
      expect(screen.getByText('Ana Pérez')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('combobox', { name: 'Filas por página' }));
    await user.click(await screen.findByRole('option', { name: '10' }));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalled();
    });
    const href = String(replaceMock.mock.calls.at(-1)?.[0]);
    expect(href).toContain('size=10');
    expect(href).not.toContain('page=');
  });

  it('filtro hace replace y resetea página', async () => {
    listMock.mockResolvedValue({
      data: [subscriberFixture('sub-1', { firstName: 'Ana', lastName: 'Pérez' })],
      total: 1,
      meta: pageMeta({ page: 1, total: 1, totalPages: 1 }),
    });

    searchParamsMock = new URLSearchParams('page=3');
    const user = userEvent.setup();
    render(<SubscribersListClient />);

    await waitFor(() => {
      expect(screen.getByText('Ana Pérez')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('combobox', { name: 'Estado' }));
    await user.click(await screen.findByRole('option', { name: /Activo/i }));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalled();
    });
    const href = String(replaceMock.mock.calls.at(-1)?.[0]);
    expect(href).toContain('status=ACTIVE');
    expect(href).not.toContain('page=');
  });

  it('corrige página fuera de rango con replace y aviso una sola vez', async () => {
    listMock.mockResolvedValue({
      data: [],
      total: 40,
      meta: pageMeta({
        page: 99,
        limit: 20,
        total: 40,
        totalPages: 2,
      }),
    });

    searchParamsMock = new URLSearchParams('page=99');
    render(<SubscribersListClient />);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalled();
    });
    const href = String(replaceMock.mock.calls[0]?.[0]);
    expect(href).toContain('page=2');
    expect(
      screen.getByText(/Esa página ya no existe\. Mostrando la última página disponible\./),
    ).toBeInTheDocument();
  });

  it('sin sortableFields no inventa encabezados ordenables', async () => {
    listMock.mockResolvedValue({
      data: [subscriberFixture('sub-1', { firstName: 'Ana', lastName: 'Pérez' })],
      total: 1,
      meta: pageMeta({
        page: 1,
        total: 1,
        totalPages: 1,
        capabilities: { randomAccess: true, sortableFields: [] },
      }),
    });

    render(<SubscribersListClient />);

    await waitFor(() => {
      expect(screen.getByText('Ana Pérez')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /Ordenar por/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Ordenar por')).not.toBeInTheDocument();
  });

  it('con sortableFields autorizados ordena y no repite filas entre páginas (empates)', async () => {
    const page1 = [
      subscriberFixture('a', { firstName: 'Misma', lastName: 'A' }, { status: 'ACTIVE' }),
      subscriberFixture('b', { firstName: 'Misma', lastName: 'B' }, { status: 'ACTIVE' }),
    ];
    const page2 = [
      subscriberFixture('c', { firstName: 'Misma', lastName: 'C' }, { status: 'ACTIVE' }),
      subscriberFixture('d', { firstName: 'Misma', lastName: 'D' }, { status: 'ACTIVE' }),
    ];

    listMock.mockImplementation(
      async (params: { page?: number; sortBy?: string; sortDir?: string; limit?: number }) => {
        const page = params.page ?? 1;
        return {
          data: page === 1 ? page1 : page2,
          total: 4,
          meta: pageMeta({
            page,
            limit: params.limit ?? 10,
            total: 4,
            totalPages: 2,
            capabilities: { randomAccess: true, sortableFields: ['status'] },
            sort:
              params.sortBy && params.sortDir
                ? { by: params.sortBy, dir: params.sortDir as 'asc' | 'desc' }
                : null,
          }),
        };
      },
    );

    searchParamsMock = new URLSearchParams('size=10&sortBy=status&sortDir=asc');
    const { rerender } = render(<SubscribersListClient />);

    await waitFor(() => {
      expect(screen.getByText('Misma A')).toBeInTheDocument();
    });
    expect(screen.getByText('Misma B')).toBeInTheDocument();
    expect(screen.queryByText('Misma C')).not.toBeInTheDocument();
    expect(listMock).toHaveBeenCalledWith(
      expect.objectContaining({ sortBy: 'status', sortDir: 'asc', page: 1, limit: 10 }),
    );

    expect(
      screen.getByRole('button', {
        name: /Ordenar por Estado/i,
      }),
    ).toBeInTheDocument();

    searchParamsMock = new URLSearchParams('size=10&sortBy=status&sortDir=asc&page=2');
    rerender(<SubscribersListClient />);

    await waitFor(() => {
      expect(screen.getByText('Misma C')).toBeInTheDocument();
    });
    expect(screen.getByText('Misma D')).toBeInTheDocument();
    expect(screen.queryByText('Misma A')).not.toBeInTheDocument();
    expect(screen.queryByText('Misma B')).not.toBeInTheDocument();
  });

  it('página única: solo conteo, sin navegación', async () => {
    listMock.mockResolvedValue({
      data: [subscriberFixture('sub-1', { firstName: 'Ana', lastName: 'Pérez' })],
      total: 1,
      meta: pageMeta({ page: 1, total: 1, totalPages: 1 }),
    });

    render(<SubscribersListClient />);

    await waitFor(() => {
      expect(screen.getAllByText('1\u20131 de 1 suscriptor').length).toBeGreaterThan(0);
    });
    expect(screen.queryByRole('button', { name: 'Siguiente' })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: /Paginación/ })).not.toBeInTheDocument();
  });

  it('cero resultados: sin pie', async () => {
    listMock.mockResolvedValue({
      data: [],
      total: 0,
      meta: pageMeta({ page: 1, total: 0, totalPages: 0 }),
    });

    searchParamsMock = new URLSearchParams('status=ACTIVE');
    render(<SubscribersListClient />);

    await waitFor(() => {
      expect(screen.getByText('No se encontraron resultados')).toBeInTheDocument();
    });
    expect(screen.getAllByRole('button', { name: 'Limpiar filtros' }).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Mostrando/)).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: /Paginación/ })).not.toBeInTheDocument();
  });

  it('coloca el alta en el contenedor de la tabla, no en el título de página', async () => {
    listMock.mockResolvedValue({
      data: [subscriberFixture('sub-1', { firstName: 'Ana', lastName: 'Pérez' })],
      total: 1,
      meta: pageMeta({ page: 1, total: 1, totalPages: 1 }),
    });

    render(<SubscribersListClient />);

    const pageTitle = screen.getByRole('heading', { name: 'Suscriptores' });
    expect(pageTitle.parentElement?.parentElement?.querySelector('button')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Nuevo suscriptor' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Nuevo suscriptor' })).toHaveAttribute(
      'href',
      '/dashboard/crm/subscribers/new',
    );
  });

  it('no duplica el alta en el empty state y lo deja a ancho de tabla', async () => {
    listMock.mockResolvedValue({
      data: [],
      total: 0,
      meta: pageMeta({ page: 1, total: 0, totalPages: 0 }),
    });

    render(<SubscribersListClient />);

    expect(await screen.findByText('Aún no hay suscriptores')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Nuevo suscriptor' })).toHaveLength(1);
  });
});
