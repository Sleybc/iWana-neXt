import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StockCountStatus } from '@iwana/shared';
import { inventoryApi } from '@/lib/api-client';
import { StockCountsWorkspace } from './StockCountsWorkspace';

const pushMock = jest.fn();
const replaceMock = jest.fn();
let searchParamsMock = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  usePathname: () => '/dashboard/inventory',
  useSearchParams: () => searchParamsMock,
}));

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    inventoryApi: {
      ...actual.inventoryApi,
      listCounts: jest.fn(),
    },
  };
});

jest.mock('./InventoryLocationPicker', () => ({
  InventoryLocationPicker: () => <div data-testid="location-picker" />,
}));

const listCountsMock = inventoryApi.listCounts as jest.Mock;

const locations = [
  {
    id: 'loc-1',
    name: 'Bodega principal',
  },
] as never;

const baseCount = {
  id: 'count-1',
  tenantId: 'tenant-1',
  countNumber: 'CNT-000001',
  status: StockCountStatus.COUNTING,
  locationId: 'loc-1',
  categoryId: null,
  notes: null,
  createdByUserId: 'admin-1',
  closedByUserId: null,
  closedAt: null,
  stockMovementId: null,
  createdAt: '2026-07-18T12:00:00.000Z',
  updatedAt: '2026-07-18T12:00:00.000Z',
};

const pageMeta = (total: number, page = 1, limit = 20) => ({
  total,
  page,
  limit,
  totalPages: Math.max(1, Math.ceil(total / limit)),
  hasMore: page * limit < total,
  mode: 'page' as const,
  nextCursor: null,
  capabilities: { randomAccess: true, sortableFields: [] as string[] },
});

describe('StockCountsWorkspace', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    searchParamsMock = new URLSearchParams();
    pushMock.mockImplementation((href: string) => {
      searchParamsMock = new URLSearchParams(String(href).split('?')[1] ?? '');
    });
    replaceMock.mockImplementation((href: string) => {
      searchParamsMock = new URLSearchParams(String(href).split('?')[1] ?? '');
    });
    Element.prototype.scrollIntoView = jest.fn();
    listCountsMock.mockResolvedValue({ data: [], meta: pageMeta(0) });
  });

  it('muestra estado vacío y permite iniciar creación', async () => {
    render(
      <StockCountsWorkspace
        locations={locations}
        categories={[]}
        canClose
        onCreate={jest.fn()}
        onUpdate={jest.fn()}
        onClose={jest.fn()}
        onCancel={jest.fn()}
        onOpenDetail={jest.fn()}
        onRefresh={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Sin conteos')).toBeInTheDocument();
    });
    const nuevoConteoButtons = screen.getAllByRole('button', { name: 'Nuevo conteo' });
    fireEvent.click(nuevoConteoButtons[0]!);
    expect(screen.getByText('Nuevo conteo físico')).toBeInTheDocument();
  });

  it('oculta cerrar conteo cuando canClose es false', async () => {
    listCountsMock.mockResolvedValue({ data: [baseCount], meta: pageMeta(1) });
    const onOpenDetail = jest.fn().mockResolvedValue({
      ...baseCount,
      lines: [
        {
          id: 'line-1',
          tenantId: 'tenant-1',
          countId: 'count-1',
          itemId: 'item-1',
          lotId: null,
          condition: 'NEW',
          expectedQty: '10.00',
          countedQty: null,
          variance: null,
          itemSku: 'CAB-01',
          itemName: 'Cable',
          createdAt: '2026-07-18T12:00:00.000Z',
        },
      ],
    });

    render(
      <StockCountsWorkspace
        locations={locations}
        categories={[]}
        canClose={false}
        onCreate={jest.fn()}
        onUpdate={jest.fn()}
        onClose={jest.fn()}
        onCancel={jest.fn()}
        onOpenDetail={onOpenDetail}
        onRefresh={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Abrir' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    await waitFor(() => {
      expect(screen.getByText('CNT-000001')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Cerrar conteo' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar conteo' })).toBeInTheDocument();
  });

  it('muestra cerrar conteo para admin', async () => {
    listCountsMock.mockResolvedValue({ data: [baseCount], meta: pageMeta(1) });
    const onOpenDetail = jest.fn().mockResolvedValue({
      ...baseCount,
      lines: [
        {
          id: 'line-1',
          tenantId: 'tenant-1',
          countId: 'count-1',
          itemId: 'item-1',
          lotId: null,
          condition: 'NEW',
          expectedQty: '10.00',
          countedQty: '8.00',
          variance: '-2.00',
          itemSku: 'CAB-01',
          itemName: 'Cable',
          createdAt: '2026-07-18T12:00:00.000Z',
        },
      ],
    });

    render(
      <StockCountsWorkspace
        locations={locations}
        categories={[]}
        canClose
        onCreate={jest.fn()}
        onUpdate={jest.fn()}
        onClose={jest.fn()}
        onCancel={jest.fn()}
        onOpenDetail={onOpenDetail}
        onRefresh={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Abrir' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cerrar conteo' })).toBeInTheDocument();
    });
  });

  it('ADR-065: reemplaza página y filtra estado en servidor (sin Cargar más)', async () => {
    const user = userEvent.setup();
    const page1 = Array.from({ length: 20 }, (_, i) => ({
      ...baseCount,
      id: `count-p1-${i}`,
      countNumber: `CNT-P1-${i}`,
    }));
    const page2 = Array.from({ length: 20 }, (_, i) => ({
      ...baseCount,
      id: `count-p2-${i}`,
      countNumber: `CNT-P2-${i}`,
    }));

    listCountsMock.mockImplementation(async (params?: { page?: number; status?: string }) => {
      const page = params?.page ?? 1;
      return {
        data: page === 1 ? page1 : page2,
        meta: pageMeta(40, page),
      };
    });

    const { rerender } = render(
      <StockCountsWorkspace
        locations={locations}
        categories={[]}
        canClose
        onCreate={jest.fn()}
        onUpdate={jest.fn()}
        onClose={jest.fn()}
        onCancel={jest.fn()}
        onOpenDetail={jest.fn()}
        onRefresh={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('count-row-count-p1-0')).toBeInTheDocument();
    });
    expect(listCountsMock).toHaveBeenCalledWith({ page: 1, limit: 20 });
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    rerender(
      <StockCountsWorkspace
        locations={locations}
        categories={[]}
        canClose
        onCreate={jest.fn()}
        onUpdate={jest.fn()}
        onClose={jest.fn()}
        onCancel={jest.fn()}
        onOpenDetail={jest.fn()}
        onRefresh={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('count-row-count-p2-0')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('count-row-count-p1-0')).not.toBeInTheDocument();
    expect(listCountsMock).toHaveBeenCalledWith(expect.objectContaining({ page: 2, limit: 20 }));
  });
});
