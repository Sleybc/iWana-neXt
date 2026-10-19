import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  CustomerSegment,
  DocumentType,
  PersonType,
  SubscriberStatus,
  VatTreatment,
  type ListMeta,
  type SubscriberListItem,
} from '@iwana/shared';
import { ApiError, subscribersApi } from '@/lib/api-client';
import { PORTAL_DEFAULT_PAGE_SIZE } from '@/lib/portal-page-size';
import { SubscribersListClient } from './SubscribersListClient';

const pushMock = jest.fn();
const replaceMock = jest.fn();
const routerMock = { push: pushMock, replace: replaceMock };
let searchParamsMock = new URLSearchParams();

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => routerMock,
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
): SubscriberListItem {
  return {
    id,
    tenantId: 'synthetic-tenant',
    partyId: null,
    userId: null,
    stratum: null,
    taxRegime: null,
    vatResponsibility: null,
    rutResponsibilities: [],
    legalRepresentative: null,
    expedienteId: null,
    convertedAt: null,
    activatedAt: null,
    commercialName: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    personType: PersonType.NATURAL,
    firstName: name.firstName,
    lastName: name.lastName,
    businessName: null,
    documentType: DocumentType.CC,
    documentNumber: id,
    email: `${id}@example.com`,
    phone: '',
    contactPending: false,
    privacyRestricted: false,
    anonymizedAt: null,
    anonymizedRequestId: null,
    customerSegment: CustomerSegment.RESIDENTIAL,
    vatTreatment: VatTreatment.STANDARD,
    status: SubscriberStatus.ACTIVE,
    hasLiveContracts: true,
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

  it('muestra Sin servicios vigentes en la fila cuando la proyección indica cero servicios activos o suspendidos', async () => {
    listMock.mockResolvedValue({
      data: [
        subscriberFixture(
          'sub-no-live-services',
          { firstName: 'Ana', lastName: 'Pérez' },
          { hasLiveContracts: false },
        ),
      ],
      total: 1,
      meta: pageMeta({ page: 1, total: 1, totalPages: 1 }),
    });

    render(<SubscribersListClient />);

    const row = await screen.findByRole('row', { name: /Ana Pérez/ });
    expect(within(row).getByText('Sin servicios vigentes')).toBeInTheDocument();
  });

  it('CA-UX-IVA-18 retira el IVA del listado y conserva el fallback de ubicación', async () => {
    listMock.mockResolvedValue({
      data: [
        subscriberFixture(
          'sub-iva',
          { firstName: 'Ana', lastName: 'Pérez' },
          { vatTreatment: 'EXCLUDED', city: undefined, department: undefined },
        ),
      ],
      total: 1,
      meta: pageMeta({ page: 1, total: 1, totalPages: 1 }),
    });

    render(<SubscribersListClient />);

    const row = await screen.findByRole('row', { name: /Ana Pérez/ });
    expect(screen.queryByRole('columnheader', { name: 'IVA' })).not.toBeInTheDocument();
    expect(within(row).queryByText('Excluido')).not.toBeInTheDocument();
    expect(within(row).getByText('Sin ubicación')).toBeInTheDocument();
  });

  it('CA-E3-04 muestra el contacto pendiente sin revelar placeholders ni enums crudos', async () => {
    const placeholder = 'expediente-sub-1@placeholder.iwana.co';
    listMock.mockResolvedValue({
      data: [
        subscriberFixture(
          'sub-pending',
          { firstName: 'Ana', lastName: 'Pérez' },
          {
            contactPending: true,
            email: placeholder,
            phone: '0000000000',
            status: 'ACTIVE',
          },
        ),
      ],
      total: 1,
      meta: pageMeta({ page: 1, total: 1, totalPages: 1 }),
    });

    render(<SubscribersListClient />);

    const row = await screen.findByRole('row', { name: /Ana Pérez/ });
    expect(within(row).getByText('Contacto pendiente')).toBeInTheDocument();
    expect(within(row).queryByText(placeholder)).not.toBeInTheDocument();
    expect(within(row).queryByText('0000000000')).not.toBeInTheDocument();
    expect(within(row).getByText('Activo')).toBeInTheDocument();
    expect(within(row).queryByText('ACTIVE')).not.toBeInTheDocument();
  });

  it('redacta los campos personales en filas con acceso bloqueado', async () => {
    listMock.mockResolvedValue({
      data: [
        subscriberFixture(
          'sub-restricted',
          { firstName: 'SENTINEL_PERSONAL', lastName: 'SENTINEL_PERSONAL' },
          {
            privacyRestricted: true,
            documentNumber: 'SENTINEL_PERSONAL',
            email: 'SENTINEL_PERSONAL',
            city: 'SENTINEL_PERSONAL',
          },
        ),
      ],
      total: 1,
      meta: pageMeta({ page: 1, total: 1, totalPages: 1 }),
    });

    render(<SubscribersListClient />);

    const row = await screen.findByRole('row', { name: /Datos bloqueados/ });
    expect(within(row).getAllByText('Datos bloqueados').length).toBeGreaterThan(0);
    expect(within(row).queryByText('SENTINEL_PERSONAL')).toBeNull();
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

// QW1: fixtures sintéticas; ninguna consulta exacta se escribe en la URL.
describe('SubscribersListClient QW1', () => {
  const searchMock = subscribersApi.search as jest.Mock;
  beforeEach(() => {
    jest.clearAllMocks();
    mockMatchMediaSmUp(true);
    searchParamsMock = new URLSearchParams();
    replaceMock.mockImplementation((href: string) => {
      searchParamsMock = new URLSearchParams(String(href).split('?')[1] ?? '');
    });
    listMock.mockResolvedValue({ data: [], meta: pageMeta({ total: 0 }) });
    searchMock.mockResolvedValue({
      data: [subscriberFixture('synthetic-1', { firstName: 'Prueba', lastName: 'Sintética' })],
    });
  });

  it('R1.2 Texto mantiene debounce y búsqueda libre sin prometer cédula', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<SubscribersListClient />);
    expect(screen.getByRole('searchbox')).toHaveAttribute(
      'placeholder',
      'Nombre, razón social o NIT',
    );
    await user.type(screen.getByRole('searchbox'), 'SYNTHETIC');
    expect(replaceMock).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith(expect.stringContaining('search=SYNTHETIC'), {
        scroll: false,
      }),
    );
    rerender(<SubscribersListClient />);
    await waitFor(() =>
      expect(listMock).toHaveBeenCalledWith(expect.objectContaining({ search: 'SYNTHETIC' })),
    );
    expect(searchMock).not.toHaveBeenCalled();
  });

  it('R1.5 restaura el modo desde URL sin consultas hasta enviar y limpia al navegar', async () => {
    searchParamsMock = new URLSearchParams('mode=document');
    const user = userEvent.setup();
    const { rerender } = render(<SubscribersListClient />);
    expect(screen.getByRole('radio', { name: 'Documento' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(listMock).not.toHaveBeenCalled();
    await user.type(screen.getByRole('searchbox'), 'DOC-SYNTHETIC');
    searchParamsMock = new URLSearchParams('mode=phone');
    rerender(<SubscribersListClient />);
    expect(screen.getByRole('searchbox')).toHaveValue('');
    expect(searchMock).not.toHaveBeenCalled();
  });

  it('R1.5 conserva la entrada mientras una navegación diferida confirma el modo', async () => {
    let pendingHref = '';
    replaceMock.mockImplementation((href: string) => {
      pendingHref = href;
    });
    const user = userEvent.setup();
    const { rerender } = render(<SubscribersListClient />);
    await user.click(screen.getByRole('radio', { name: 'Documento' }));
    await user.type(screen.getByRole('searchbox'), 'DOC-SYNTHETIC');
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(searchMock).not.toHaveBeenCalled();
    expect(pendingHref).toContain('mode=document');
    expect(pendingHref).not.toContain('DOC-SYNTHETIC');
    searchParamsMock = new URLSearchParams(pendingHref.split('?')[1]);
    rerender(<SubscribersListClient />);
    expect(screen.getByRole('searchbox')).toHaveValue('DOC-SYNTHETIC');
    expect(screen.getByRole('radio', { name: 'Documento' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    await waitFor(() =>
      expect(searchMock).toHaveBeenCalledWith({ documentNumber: 'DOC-SYNTHETIC' }),
    );
    searchParamsMock = new URLSearchParams('mode=phone');
    rerender(<SubscribersListClient />);
    expect(screen.getByRole('searchbox')).toHaveValue('');
    expect(screen.getByRole('radio', { name: 'Teléfono' })).toHaveAttribute('aria-checked', 'true');
    searchParamsMock = new URLSearchParams('mode=document');
    rerender(<SubscribersListClient />);
    expect(screen.getByRole('searchbox')).toHaveValue('');
  });

  it('R1.3 ignora una respuesta tardía al cambiar modo y evita envíos duplicados', async () => {
    let resolveSearch!: (value: Awaited<ReturnType<typeof subscribersApi.search>>) => void;
    searchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSearch = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<SubscribersListClient />);
    await user.click(screen.getByRole('radio', { name: 'Documento' }));
    await user.type(screen.getByRole('searchbox'), 'DOC-SYNTHETIC');
    await user.keyboard('{Enter}{Enter}');
    expect(searchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Buscar' })).toHaveAttribute('aria-busy', 'true');
    await user.click(screen.getByRole('radio', { name: 'Correo' }));
    await act(async () => {
      resolveSearch({
        data: [
          subscriberFixture('late-synthetic', { firstName: 'Respuesta', lastName: 'Antigua' }),
        ],
      });
    });
    expect(screen.queryByText('Respuesta Antigua')).not.toBeInTheDocument();
    expect(screen.getByRole('searchbox')).toHaveValue('');
  });

  it.each([
    ['Documento', 'CC-SYNTHETIC-001', { documentNumber: 'CC-SYNTHETIC-001' }, 'document'],
    ['Documento', '900000001', { nit: '900000001' }, 'document'],
    ['Documento', '900000001-1', { nit: '900000001' }, 'document'],
    ['Documento', '1000000001', { documentNumber: '1000000001' }, 'document'],
    ['Teléfono', '5550000001', { phone: '5550000001' }, 'phone'],
    ['Correo', 'synthetic@example.invalid', { email: 'synthetic@example.invalid' }, 'email'],
  ])(
    'CA1/CA2 %s envía %s solo al confirmar y conserva privacidad',
    async (label, value, payload, mode) => {
      const user = userEvent.setup();
      render(<SubscribersListClient />);
      await user.click(screen.getByRole('radio', { name: label }));
      const field = screen.getByRole('searchbox', { name: 'Buscar suscriptor' });
      await user.type(field, value);
      await new Promise((resolve) => setTimeout(resolve, 400));
      expect(searchMock).not.toHaveBeenCalled();
      expect(screen.queryByRole('combobox', { name: 'Estado' })).not.toBeInTheDocument();
      await user.keyboard('{Enter}');
      await waitFor(() => expect(searchMock).toHaveBeenCalledWith(payload));
      expect(await screen.findByText('Prueba Sintética')).toBeInTheDocument();
      expect(screen.getByText('Coincidencia exacta · 1 resultado')).toBeInTheDocument();
      expect(screen.queryByRole('navigation', { name: /Paginación/ })).not.toBeInTheDocument();
      expect(replaceMock).toHaveBeenCalledWith(expect.stringContaining(`mode=${mode}`), {
        scroll: false,
      });
      for (const [url] of replaceMock.mock.calls) {
        expect(decodeURIComponent(String(url))).not.toContain(value);
        expect(String(url)).not.toContain('search=');
      }
    },
  );

  it('R1.1 selector con flechas, Home y End; R1.5 limpia al cambiar de modo', async () => {
    const user = userEvent.setup();
    render(<SubscribersListClient />);
    expect(screen.getByRole('radiogroup', { name: 'Buscar por' })).toBeInTheDocument();
    const text = screen.getByRole('radio', { name: 'Texto' });
    text.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Documento' })).toHaveFocus();
    await user.type(screen.getByRole('searchbox'), 'SYNTHETIC');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(await screen.findByText('Prueba Sintética')).toBeInTheDocument();
    screen.getByRole('radio', { name: 'Documento' }).focus();
    await user.keyboard('{End}');
    expect(screen.getByRole('radio', { name: 'Correo' })).toHaveFocus();
    expect(screen.getByRole('searchbox')).toHaveValue('');
    expect(screen.queryByText('Prueba Sintética')).not.toBeInTheDocument();
    await user.keyboard('{Home}');
    expect(text).toHaveFocus();
    expect(text).toHaveAttribute('aria-checked', 'true');
  });

  it('R1.4 vacío exacto ofrece Buscar como texto sin trasladar el documento', async () => {
    searchMock.mockResolvedValue({ data: [] });
    const user = userEvent.setup();
    render(<SubscribersListClient />);
    await user.click(screen.getByRole('radio', { name: 'Documento' }));
    await user.type(screen.getByRole('searchbox'), 'DOC-SYNTHETIC');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(await screen.findByText('No hay suscriptores con ese documento')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Buscar como texto' }));
    expect(screen.getByRole('radio', { name: 'Texto' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('searchbox')).toHaveValue('');
    await new Promise((resolve) => setTimeout(resolve, 400));
    for (const [url] of replaceMock.mock.calls) {
      expect(decodeURIComponent(String(url))).not.toContain('DOC-SYNTHETIC');
    }
  });

  it('R1.6 valida el correo y el largo mínimo antes de consultar', async () => {
    const user = userEvent.setup();
    render(<SubscribersListClient />);
    await user.click(screen.getByRole('radio', { name: 'Correo' }));
    await user.type(screen.getByRole('searchbox'), 'incorrecto');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(await screen.findByText('Escribe un correo válido.')).toBeInTheDocument();
    const invalidField = screen.getByRole('searchbox');
    expect(invalidField).toHaveAttribute('aria-invalid', 'true');
    expect(invalidField).toHaveAccessibleDescription('Escribe un correo válido.');
    expect(screen.getByText('Escribe un correo válido.')).toHaveClass('dark:text-error-400');
    await user.click(screen.getByRole('radio', { name: 'Teléfono' }));
    await user.type(screen.getByRole('searchbox'), '12');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(await screen.findByText('Escribe entre 3 y 50 caracteres.')).toBeInTheDocument();
    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), '1'.repeat(51));
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(screen.getByText('Escribe entre 3 y 50 caracteres.')).toBeInTheDocument();
    expect(searchMock).not.toHaveBeenCalled();
  });

  it('R1.7 presenta el error de API y conserva la redacción de resultados restringidos', async () => {
    const { ApiError } = jest.requireActual('@/lib/api-client');
    searchMock.mockRejectedValueOnce(
      new ApiError(503, 'SEARCH_UNAVAILABLE', 'Consulta no disponible'),
    );
    const user = userEvent.setup();
    render(<SubscribersListClient />);
    await user.click(screen.getByRole('radio', { name: 'Documento' }));
    await user.type(screen.getByRole('searchbox'), 'DOC-SYNTHETIC');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(await screen.findByText('Consulta no disponible')).toBeInTheDocument();
    searchMock.mockResolvedValue({
      data: [
        subscriberFixture(
          'synthetic-1',
          { firstName: 'SENTINEL', lastName: 'PERSONAL' },
          { privacyRestricted: true },
        ),
      ],
    });
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(await screen.findByRole('row', { name: /Datos bloqueados/ })).toBeInTheDocument();
    expect(screen.queryByText('SENTINEL PERSONAL')).not.toBeInTheDocument();
  });
});
