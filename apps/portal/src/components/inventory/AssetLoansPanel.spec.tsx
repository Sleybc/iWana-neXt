import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  inventoryApi,
  type AssetLoanRecord,
  type InventoryItemRecord,
  type SerializedAssetRecord,
} from '@/lib/api-client';
import { AssetLoansPanel } from './AssetLoansPanel';
import { ASSET_LOAN_STATUS_LABELS, formatInventoryOpaqueRef } from './inventory-labels';

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
      listLoans: jest.fn(),
    },
  };
});

const listLoansMock = inventoryApi.listLoans as jest.Mock;

const SUBSCRIBER_REF = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const CONTRACT_REF = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

const mockAssets = [
  {
    id: 'asset-001',
    inventoryItemId: 'item-001',
    serialNumber: 'SN-001',
    assetTag: null,
  },
] as SerializedAssetRecord[];

const mockItems = [
  {
    id: 'item-001',
    sku: 'ONT-001',
    name: 'ONT WiFi 6',
  },
] as InventoryItemRecord[];

function buildLoan(overrides: Partial<AssetLoanRecord> = {}): AssetLoanRecord {
  return {
    id: 'loan-001',
    serializedAssetId: 'asset-001',
    subscriberRefId: SUBSCRIBER_REF,
    contractRefId: CONTRACT_REF,
    installedAt: '2026-06-01T10:00:00.000Z',
    removedAt: null,
    executionOrderRefId: 'eo-001',
    stockMovementId: 'mov-001',
    status: 'abierto',
    ...overrides,
  };
}

describe('AssetLoansPanel ADR-065', () => {
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

  it('lista comodatos con referencias opacas y acceso a ficha 360', async () => {
    const onOpenAssetDetail = jest.fn();
    listLoansMock.mockResolvedValue({
      data: [buildLoan()],
      total: 1,
      page: 1,
      limit: 20,
    });

    render(
      <AssetLoansPanel
        onOpenAssetDetail={onOpenAssetDetail}
        assets={mockAssets}
        items={mockItems}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('asset-loan-row-loan-001')).toBeInTheDocument();
    });

    expect(listLoansMock).toHaveBeenCalledWith({ page: 1, limit: 20 });
    expect(screen.getByText('ONT-001 · SN-001')).toBeInTheDocument();
    expect(
      screen.getByText(formatInventoryOpaqueRef('subscriber', SUBSCRIBER_REF)),
    ).toBeInTheDocument();
    expect(
      screen.getByText(formatInventoryOpaqueRef('contract', CONTRACT_REF)),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('asset-loan-row-loan-001')).getByText('Abierto'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ver ficha 360' }));
    expect(onOpenAssetDetail).toHaveBeenCalledWith('asset-001');
  });

  it('muestra estado vacío cuando no hay comodatos', async () => {
    listLoansMock.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
    });

    render(<AssetLoansPanel onOpenAssetDetail={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Sin comodatos registrados')).toBeInTheDocument();
    });
  });

  it('filtra por estado con Select de @iwana/ui', async () => {
    const user = userEvent.setup();
    listLoansMock.mockResolvedValue({
      data: [buildLoan()],
      total: 1,
      page: 1,
      limit: 20,
    });

    const { rerender } = render(<AssetLoansPanel onOpenAssetDetail={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('asset-loans-panel')).toBeInTheDocument();
    });

    expect(screen.getByTestId('asset-loans-status-filter')).toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: 'Estado' }));
    await user.click(await screen.findByRole('option', { name: ASSET_LOAN_STATUS_LABELS.cerrado }));
    rerender(<AssetLoansPanel onOpenAssetDetail={jest.fn()} />);

    await waitFor(() => {
      expect(listLoansMock).toHaveBeenCalledWith({
        status: 'cerrado',
        page: 1,
        limit: 20,
      });
    });
  });

  it('ADR-065: reemplaza página (conjuntos disjuntos, sin Cargar más)', async () => {
    const user = userEvent.setup();
    const page1 = Array.from({ length: 20 }, (_, i) =>
      buildLoan({ id: `loan-p1-${i}`, serializedAssetId: `asset-p1-${i}` }),
    );
    const page2 = Array.from({ length: 20 }, (_, i) =>
      buildLoan({
        id: `loan-p2-${i}`,
        serializedAssetId: `asset-p2-${i}`,
        status: 'cerrado',
        removedAt: '2026-07-01T10:00:00.000Z',
      }),
    );

    listLoansMock.mockImplementation(async (params?: { page?: number }) => {
      const page = params?.page ?? 1;
      return {
        data: page === 1 ? page1 : page2,
        total: 40,
        page,
        limit: 20,
      };
    });

    const { rerender } = render(<AssetLoansPanel onOpenAssetDetail={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('asset-loan-row-loan-p1-0')).toBeInTheDocument();
    });
    expect(screen.getAllByText(/Mostrando 1\u201320 de 40 comodatos/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    rerender(<AssetLoansPanel onOpenAssetDetail={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('asset-loan-row-loan-p2-0')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('asset-loan-row-loan-p1-0')).not.toBeInTheDocument();
    expect(listLoansMock).toHaveBeenCalledWith(expect.objectContaining({ page: 2, limit: 20 }));
  });
});
