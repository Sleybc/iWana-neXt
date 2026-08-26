import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InstallationRule } from '@iwana/shared';
import { PlanCatalogPanel } from './PlanCatalogPanel';
import { EMPTY_LIST_META } from '@/lib/list-meta';
import type { PlanCatalogItem } from '@/lib/api-client';

const mockGetPlans = jest.fn();
const mockCreatePlan = jest.fn();
const mockUpdatePlan = jest.fn();
const mockDeletePlan = jest.fn();
const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockNavListeners = new Set<() => void>();
let mockSearchParams = new URLSearchParams();

function mockApplyHref(href: string) {
  mockSearchParams = new URLSearchParams(String(href).split('?')[1] ?? '');
  mockNavListeners.forEach((listener) => listener());
}

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

jest.mock('next/navigation', () => {
  const React = require('react') as typeof import('react');
  return {
    usePathname: () => '/dashboard/commercial',
    useSearchParams: () => {
      const [, setTick] = React.useState(0);
      React.useEffect(() => {
        const listener = () => setTick((n: number) => n + 1);
        mockNavListeners.add(listener);
        return () => {
          mockNavListeners.delete(listener);
        };
      }, []);
      return mockSearchParams;
    },
    useRouter: () => ({
      replace: (href: string, opts?: { scroll?: boolean }) => {
        mockReplace(href, opts);
        mockApplyHref(href);
      },
      push: (href: string, opts?: { scroll?: boolean }) => {
        mockPush(href, opts);
        mockApplyHref(href);
      },
    }),
  };
});

jest.mock('@/lib/api-client', () => ({
  ApiError: class ApiError extends Error {
    status?: number;
  },
  commercialApi: {
    getPlans: (...args: unknown[]) => mockGetPlans(...args),
    createPlan: (...args: unknown[]) => mockCreatePlan(...args),
    updatePlan: (...args: unknown[]) => mockUpdatePlan(...args),
    deletePlan: (...args: unknown[]) => mockDeletePlan(...args),
  },
}));

function pageMeta(overrides: Record<string, unknown> = {}) {
  return {
    ...EMPTY_LIST_META,
    nextCursor: null,
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 1,
    hasMore: false,
    mode: 'page' as const,
    capabilities: { randomAccess: true, sortableFields: [] as string[] },
    sort: null,
    ...overrides,
  };
}

const PLAN_SORTABLE_FIELDS = [
  'name',
  'downloadSpeedMbps',
  'basePrice',
  'installationFee',
  'isActive',
  'technology',
  'description',
  'createdAt',
  'updatedAt',
];

function buildPlan(overrides: Partial<PlanCatalogItem> = {}): PlanCatalogItem {
  return {
    id: 'plan-1',
    name: 'Hogar 300',
    technology: 'GPON',
    installationRule: InstallationRule.ON_DEMAND,
    downloadSpeedMbps: 300,
    uploadSpeedMbps: 300,
    basePrice: 89900,
    installationFee: 50000,
    currentPrice: '89900',
    isActive: true,
    createdAt: '2026-05-01T10:00:00.000Z',
    updatedAt: '2026-05-02T11:00:00.000Z',
    ...overrides,
  };
}

describe('PlanCatalogPanel', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
    mockNavListeners.clear();
    mockGetPlans.mockResolvedValue({
      data: [],
      meta: pageMeta(),
    });
    mockCreatePlan.mockResolvedValue(undefined);
    mockUpdatePlan.mockResolvedValue(undefined);
    mockDeletePlan.mockResolvedValue(undefined);
    window.localStorage.clear();
    jest.clearAllMocks();
    mockMatchMediaSmUp(true);
  });

  it('pide la primera página con page=1 y limit=20, sin cursor', async () => {
    render(<PlanCatalogPanel canEdit />);

    await waitFor(() => {
      expect(mockGetPlans).toHaveBeenCalled();
    });

    const firstCall = mockGetPlans.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(firstCall).toEqual({ page: 1, limit: 20 });
    expect(firstCall).not.toHaveProperty('cursor');
  });

  it('no muestra FTTH en el selector de tecnología del nuevo plan', async () => {
    window.localStorage.setItem(
      'iwana.portal.commercial.plan-technology-options',
      JSON.stringify(['Fibra Optica', 'Radio Enlace', 'XGS-PON']),
    );

    render(<PlanCatalogPanel canEdit />);

    await waitFor(() => {
      expect(mockGetPlans).toHaveBeenCalled();
    });

    const nuevoPlanButtons = await screen.findAllByRole('button', { name: 'Nuevo plan' });
    fireEvent.click(nuevoPlanButtons[0]!);

    const technologySelect = await screen.findByRole('combobox', { name: 'Tecnología' });
    fireEvent.click(technologySelect);

    const listbox = await screen.findByRole('listbox', { name: 'Tecnología' });
    const options = screen.getAllByRole('option');

    expect(listbox).toBeInTheDocument();
    expect(options).toHaveLength(3);
    expect(screen.queryByRole('option', { name: 'FTTH' })).not.toBeInTheDocument();
  });

  it('muestra barra de filtros cuando hay planes en catálogo', async () => {
    mockGetPlans.mockResolvedValue({
      data: [buildPlan()],
      meta: pageMeta({ total: 1, totalPages: 1 }),
    });

    render(<PlanCatalogPanel canEdit />);

    expect(await screen.findByLabelText('Buscar plan')).toBeInTheDocument();
    expect(screen.queryByLabelText('Estado')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sin precio vigente' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Columnas de la tabla' })).toBeInTheDocument();
    expect(screen.getAllByText(/1 plan/).length).toBeGreaterThan(0);
    expect(screen.getByText('Hogar 300')).toBeInTheDocument();
  });

  it('no envía isActive al listar planes', async () => {
    mockGetPlans.mockResolvedValue({
      data: [buildPlan()],
      meta: pageMeta({ total: 1, totalPages: 1 }),
    });

    render(<PlanCatalogPanel canEdit />);

    await screen.findByText('Hogar 300');
    const lastCall = mockGetPlans.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(lastCall).not.toHaveProperty('isActive');
  });

  it('envía missingPrice al servidor al activar el chip', async () => {
    mockGetPlans.mockResolvedValue({
      data: [buildPlan({ basePrice: null, currentPrice: null })],
      meta: pageMeta({ total: 1 }),
    });

    render(<PlanCatalogPanel canEdit />);

    expect(await screen.findByText('Hogar 300')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sin precio vigente' }));

    await waitFor(() => {
      const lastCall = mockGetPlans.mock.calls.at(-1)?.[0] as Record<string, unknown>;
      expect(lastCall).toEqual(expect.objectContaining({ missingPrice: true, page: 1, limit: 20 }));
    });
  });

  it('con una sola página muestra conteo y no Cargar más', async () => {
    mockGetPlans.mockResolvedValue({
      data: [
        buildPlan({
          id: 'p1',
          name: 'Plan Alto',
          technology: 'Fibra Optica',
          downloadSpeedMbps: 120,
          uploadSpeedMbps: 60,
          basePrice: 100000,
        }),
      ],
      meta: pageMeta({ total: 1, totalPages: 1 }),
    });

    render(<PlanCatalogPanel canEdit />);

    expect(await screen.findByText('Plan Alto')).toBeInTheDocument();
    expect(screen.getAllByText(/1 plan/).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /cargar más/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: /Paginación/ })).not.toBeInTheDocument();
  });

  it('muestra pager numerado y hace push al cambiar de página', async () => {
    mockGetPlans.mockImplementation(async (params: { page?: number; limit?: number }) => {
      const requestedPage = params.page ?? 1;
      return {
        data: [buildPlan({ id: `plan-p${requestedPage}`, name: `Plan página ${requestedPage}` })],
        meta: pageMeta({
          page: requestedPage,
          limit: 20,
          total: 45,
          totalPages: 3,
          hasMore: requestedPage < 3,
        }),
      };
    });

    render(<PlanCatalogPanel canEdit />);

    expect(await screen.findByText('Plan página 1')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /Paginación/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cargar más/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalled();
    });
    const pushed = String(mockPush.mock.calls.at(-1)?.[0]);
    expect(pushed).toContain('page=2');
    expect(pushed).not.toContain('pageSize=');

    await waitFor(() => {
      const lastCall = mockGetPlans.mock.calls.at(-1)?.[0] as Record<string, unknown>;
      expect(lastCall).toEqual(expect.objectContaining({ page: 2, limit: 20 }));
      expect(lastCall).not.toHaveProperty('cursor');
    });
  });

  it('al cambiar el tamaño hace replace, resetea a página 1 y usa size (no pageSize)', async () => {
    const user = userEvent.setup();
    mockGetPlans.mockResolvedValue({
      data: [buildPlan()],
      meta: pageMeta({ total: 45, totalPages: 3, hasMore: true }),
    });

    render(<PlanCatalogPanel canEdit />);

    expect(await screen.findByText('Hogar 300')).toBeInTheDocument();
    const sizeSelects = screen.getAllByRole('combobox', { name: 'Filas por página' });
    await user.click(sizeSelects[0]!);
    await user.click(await screen.findByRole('option', { name: '50' }));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalled();
    });
    const replaced = String(mockReplace.mock.calls.at(-1)?.[0]);
    expect(replaced).toContain('size=50');
    expect(replaced).not.toContain('page=');
    expect(replaced).not.toContain('pageSize=');

    await waitFor(() => {
      const lastCall = mockGetPlans.mock.calls.at(-1)?.[0] as Record<string, unknown>;
      expect(lastCall).toEqual(expect.objectContaining({ page: 1, limit: 50 }));
    });
  });

  it('hidrata deep-link page/size/q y pide exactamente esos params', async () => {
    mockSearchParams = new URLSearchParams('page=2&size=10&q=gpon');
    mockGetPlans.mockResolvedValue({
      data: [buildPlan({ name: 'GPON 200' })],
      meta: pageMeta({ page: 2, limit: 10, total: 12, totalPages: 2 }),
    });

    render(<PlanCatalogPanel canEdit />);

    await waitFor(() => {
      expect(mockGetPlans).toHaveBeenCalled();
    });

    const firstCall = mockGetPlans.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(firstCall).toEqual({ page: 2, limit: 10, name: 'gpon' });
    expect(firstCall).not.toHaveProperty('cursor');
    expect(await screen.findByText('GPON 200')).toBeInTheDocument();
  });

  it('hidrata sortBy/sortDir y los envía al API', async () => {
    mockSearchParams = new URLSearchParams('sortBy=name&sortDir=desc');
    mockGetPlans.mockResolvedValue({
      data: [buildPlan()],
      meta: pageMeta({
        total: 1,
        capabilities: { randomAccess: true, sortableFields: PLAN_SORTABLE_FIELDS },
        sort: { by: 'name', dir: 'desc' },
      }),
    });

    render(<PlanCatalogPanel canEdit />);

    await waitFor(() => {
      expect(mockGetPlans).toHaveBeenCalled();
    });

    const firstCall = mockGetPlans.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(firstCall).toEqual({ page: 1, limit: 20, sortBy: 'name', sortDir: 'desc' });
  });

  it('al ordenar por Plan hace replace con sortBy y resetea la página', async () => {
    mockGetPlans.mockResolvedValue({
      data: [buildPlan()],
      meta: pageMeta({
        total: 45,
        totalPages: 3,
        hasMore: true,
        capabilities: { randomAccess: true, sortableFields: PLAN_SORTABLE_FIELDS },
      }),
    });

    render(<PlanCatalogPanel canEdit />);
    expect(await screen.findByText('Hogar 300')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ordenar por Plan, ascendente' }));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalled();
    });
    const replaced = String(mockReplace.mock.calls.at(-1)?.[0]);
    expect(replaced).toContain('sortBy=name');
    expect(replaced).toContain('sortDir=asc');
    expect(replaced).not.toContain('page=');

    await waitFor(() => {
      const lastCall = mockGetPlans.mock.calls.at(-1)?.[0] as Record<string, unknown>;
      expect(lastCall).toEqual(
        expect.objectContaining({ page: 1, limit: 20, sortBy: 'name', sortDir: 'asc' }),
      );
    });

    const callsAfterSort = mockGetPlans.mock.calls.filter((call) => {
      const params = call[0] as Record<string, unknown>;
      return params.sortBy === 'name';
    }).length;
    expect(callsAfterSort).toBeLessThanOrEqual(2);
  });

  it('envía el nombre buscado en el último call tras el debounce', async () => {
    mockGetPlans.mockResolvedValue({
      data: [buildPlan()],
      meta: pageMeta({ total: 1 }),
    });

    render(<PlanCatalogPanel canEdit />);
    expect(await screen.findByText('Hogar 300')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Buscar plan'), { target: { value: 'gpon' } });

    await waitFor(() => {
      const lastCall = mockGetPlans.mock.calls.at(-1)?.[0] as Record<string, unknown>;
      expect(lastCall).toEqual(expect.objectContaining({ name: 'gpon', page: 1, limit: 20 }));
    });
  });
});
