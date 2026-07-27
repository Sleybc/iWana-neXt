import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { inventoryApi, type SerializedAssetRecord } from '@/lib/api-client';
import { AssetsWorkspace } from './AssetsWorkspace';

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
      listAssets: jest.fn(),
      listLoans: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 }),
      listUsefulLifeAlerts: jest.fn().mockResolvedValue({
        data: [],
        meta: {
          total: 0,
          page: 1,
          limit: 20,
          mode: 'page',
          capabilities: { randomAccess: true, sortableFields: [] },
        },
      }),
    },
  };
});

const listAssetsMock = inventoryApi.listAssets as jest.Mock;

function buildAsset(overrides: Partial<SerializedAssetRecord> = {}): SerializedAssetRecord {
  return {
    id: 'asset-001',
    inventoryItemId: 'item-001',
    serialNumber: 'SN-001',
    assetTag: null,
    currentStatus: 'IN_STOCK',
    currentLocationId: 'loc-001',
    purchaseDate: '2026-01-15',
    ...overrides,
  } as SerializedAssetRecord;
}

describe('AssetsWorkspace ADR-065 lista', () => {
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
  });

  it('lista activos con page y abre detalle', async () => {
    const onOpenAssetDetail = jest.fn();
    listAssetsMock.mockResolvedValue({
      data: [buildAsset()],
      meta: {
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasMore: false,
        mode: 'page',
        nextCursor: null,
        capabilities: { randomAccess: true, sortableFields: [] },
      },
    });

    render(
      <AssetsWorkspace
        items={[{ id: 'item-001', name: 'ONT WiFi', sku: 'ONT-1' } as never]}
        locations={[{ id: 'loc-001', name: 'Bodega central' } as never]}
        onOpenAssetDetail={onOpenAssetDetail}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('asset-row-asset-001')).toBeInTheDocument();
    });
    expect(listAssetsMock).toHaveBeenCalledWith({ page: 1, limit: 20 });
    expect(screen.getByText('ONT WiFi')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Ver detalle' }));
    expect(onOpenAssetDetail).toHaveBeenCalledWith('asset-001');
  });

  it('ADR-065: reemplaza página (conjuntos disjuntos, sin Cargar más)', async () => {
    const user = userEvent.setup();
    const page1 = Array.from({ length: 20 }, (_, i) =>
      buildAsset({ id: `asset-p1-${i}`, serialNumber: `SN-P1-${i}` }),
    );
    const page2 = Array.from({ length: 20 }, (_, i) =>
      buildAsset({ id: `asset-p2-${i}`, serialNumber: `SN-P2-${i}` }),
    );

    listAssetsMock.mockImplementation(async (params?: { page?: number }) => {
      const page = params?.page ?? 1;
      return {
        data: page === 1 ? page1 : page2,
        meta: {
          total: 40,
          page,
          limit: 20,
          totalPages: 2,
          hasMore: page < 2,
          mode: 'page',
          nextCursor: null,
          capabilities: { randomAccess: true, sortableFields: [] },
        },
      };
    });

    const { rerender } = render(
      <AssetsWorkspace items={[]} locations={[]} onOpenAssetDetail={jest.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('asset-row-asset-p1-0')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    rerender(<AssetsWorkspace items={[]} locations={[]} onOpenAssetDetail={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('asset-row-asset-p2-0')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('asset-row-asset-p1-0')).not.toBeInTheDocument();
    expect(listAssetsMock).toHaveBeenCalledWith(expect.objectContaining({ page: 2, limit: 20 }));
  });
});
