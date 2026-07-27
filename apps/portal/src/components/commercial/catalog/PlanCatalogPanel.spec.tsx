import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PlanCatalogPanel } from './PlanCatalogPanel';
import { EMPTY_LIST_META } from '@/lib/list-meta';

const mockGetPlans = jest.fn();
const mockCreatePlan = jest.fn();
const mockUpdatePlan = jest.fn();
const mockDeletePlan = jest.fn();
const mockReplace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => '/dashboard/commercial',
  useSearchParams: () => new URLSearchParams('tab=plans'),
}));

jest.mock('@/lib/api-client', () => ({
  ApiError: class ApiError extends Error {
    status?: number;
  },
  COMMERCIAL_LIST_PAGE_SIZE: 20,
  commercialApi: {
    getPlans: (...args: unknown[]) => mockGetPlans(...args),
    createPlan: (...args: unknown[]) => mockCreatePlan(...args),
    updatePlan: (...args: unknown[]) => mockUpdatePlan(...args),
    deletePlan: (...args: unknown[]) => mockDeletePlan(...args),
  },
}));

describe('PlanCatalogPanel', () => {
  beforeEach(() => {
    mockGetPlans.mockResolvedValue({
      data: [],
      meta: { ...EMPTY_LIST_META, nextCursor: null, total: 0 },
    });
    mockCreatePlan.mockResolvedValue(undefined);
    mockUpdatePlan.mockResolvedValue(undefined);
    mockDeletePlan.mockResolvedValue(undefined);
    window.localStorage.clear();
    jest.clearAllMocks();
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
      data: [
        {
          id: 'plan-1',
          name: 'Hogar 300',
          technology: 'GPON',
          installationRule: 'ON_DEMAND',
          downloadSpeedMbps: 300,
          uploadSpeedMbps: 300,
          basePrice: 89900,
          installationFee: 50000,
          currentPrice: '89900',
          isActive: true,
          createdAt: '2026-05-01T10:00:00.000Z',
          updatedAt: '2026-05-02T11:00:00.000Z',
        },
      ],
      meta: { ...EMPTY_LIST_META, nextCursor: null, total: 1 },
    });

    render(<PlanCatalogPanel canEdit />);

    expect(await screen.findByLabelText('Buscar plan')).toBeInTheDocument();
    expect(screen.getByLabelText('Estado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sin precio vigente' })).toBeInTheDocument();
    expect(screen.getByText('1 plan')).toBeInTheDocument();
    expect(screen.getByText('Hogar 300')).toBeInTheDocument();
  });

  it('envía missingPrice al servidor al activar el chip', async () => {
    mockGetPlans.mockResolvedValue({
      data: [
        {
          id: 'plan-1',
          name: 'Hogar 300',
          technology: 'GPON',
          installationRule: 'ON_DEMAND',
          downloadSpeedMbps: 300,
          uploadSpeedMbps: 300,
          basePrice: null,
          installationFee: 0,
          currentPrice: null,
          isActive: true,
          createdAt: '2026-05-01T10:00:00.000Z',
          updatedAt: '2026-05-02T11:00:00.000Z',
        },
      ],
      meta: { ...EMPTY_LIST_META, nextCursor: null, total: 1 },
    });

    render(<PlanCatalogPanel canEdit />);

    expect(await screen.findByText('Hogar 300')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sin precio vigente' }));

    await waitFor(() => {
      expect(mockGetPlans.mock.calls.some((call) => call[0]?.missingPrice === true)).toBe(true);
    });
  });

  it('ADR-064: con una sola página muestra conteo y no Cargar más', async () => {
    mockGetPlans.mockResolvedValue({
      data: [
        {
          id: 'p1',
          name: 'Plan Alto',
          technology: 'Fibra Optica',
          downloadSpeedMbps: 120,
          uploadSpeedMbps: 60,
          basePrice: '100000',
          installationRule: 'ON_DEMAND',
          installationFee: '50000',
          isActive: true,
          createdAt: '2026-05-01T10:00:00.000Z',
          updatedAt: '2026-05-02T11:00:00.000Z',
        },
      ],
      meta: { ...EMPTY_LIST_META, nextCursor: null, total: 1 },
    });

    render(<PlanCatalogPanel canEdit />);

    expect(await screen.findByText('1 plan')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cargar más/i })).not.toBeInTheDocument();
  });

  it('ADR-064: muestra Cargar más cuando hay nextCursor y concatena', async () => {
    mockGetPlans
      .mockResolvedValueOnce({
        data: [
          {
            id: 'plan-1',
            name: 'Hogar 300',
            technology: 'GPON',
            installationRule: 'ON_DEMAND',
            downloadSpeedMbps: 300,
            uploadSpeedMbps: 300,
            basePrice: 89900,
            installationFee: 50000,
            currentPrice: '89900',
            isActive: true,
            createdAt: '2026-05-01T10:00:00.000Z',
            updatedAt: '2026-05-02T11:00:00.000Z',
          },
        ],
        meta: { ...EMPTY_LIST_META, nextCursor: 'cursor-2', total: 2 },
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: 'plan-2',
            name: 'Hogar 600',
            technology: 'GPON',
            installationRule: 'ON_DEMAND',
            downloadSpeedMbps: 600,
            uploadSpeedMbps: 600,
            basePrice: 109900,
            installationFee: 50000,
            currentPrice: '109900',
            isActive: true,
            createdAt: '2026-05-01T10:00:00.000Z',
            updatedAt: '2026-05-02T11:00:00.000Z',
          },
        ],
        meta: { ...EMPTY_LIST_META, nextCursor: null, total: 2 },
      });

    render(<PlanCatalogPanel canEdit />);

    expect(await screen.findByText('1 de 2 planes')).toBeInTheDocument();
    const loadMore = await screen.findByRole('button', { name: 'Cargar más' });
    fireEvent.click(loadMore);

    await waitFor(() => {
      expect(mockGetPlans.mock.calls.some((call) => call[0]?.cursor === 'cursor-2')).toBe(true);
    });
    expect(await screen.findByText('Hogar 600')).toBeInTheDocument();
    expect(screen.getByText('2 planes')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
  });
});
