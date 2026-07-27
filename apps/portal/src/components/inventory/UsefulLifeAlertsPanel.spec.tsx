import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { inventoryApi, type UsefulLifeAlertRecord } from '@/lib/api-client';
import { UsefulLifeAlertsPanel } from './UsefulLifeAlertsPanel';
import { getUsefulLifeStatusLabel, USEFUL_LIFE_STATUS_LABELS } from './inventory-labels';

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
      listUsefulLifeAlerts: jest.fn(),
    },
  };
});

const listUsefulLifeAlertsMock = inventoryApi.listUsefulLifeAlerts as jest.Mock;

function buildAlert(overrides: Partial<UsefulLifeAlertRecord> = {}): UsefulLifeAlertRecord {
  return {
    id: 'asset-ul-1',
    serialNumber: 'SN-UL-001',
    assetTag: null,
    sku: 'ONT-01',
    itemName: 'ONT WiFi 6',
    status: 'por-vencer',
    monthsRemaining: 2,
    monthsTotal: 36,
    purchaseDate: '2023-07-01',
    warrantyUntil: '2026-07-01',
    ...overrides,
  };
}

describe('UsefulLifeAlertsPanel ADR-065', () => {
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

  it('lista alertas con chip en español y abre ficha 360', async () => {
    const onOpenAssetDetail = jest.fn();
    listUsefulLifeAlertsMock.mockResolvedValue({
      data: [
        buildAlert(),
        buildAlert({
          id: 'asset-ul-2',
          serialNumber: 'SN-UL-002',
          status: 'vencida',
          monthsRemaining: 0,
        }),
      ],
      total: 2,
      page: 1,
      limit: 20,
      pageSize: 20,
    });

    render(
      <UsefulLifeAlertsPanel
        onOpenAssetDetail={onOpenAssetDetail}
        onNavigateToReplenishment={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('useful-life-alert-row-asset-ul-1')).toBeInTheDocument();
    });

    expect(listUsefulLifeAlertsMock).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
    });
    expect(
      within(screen.getByTestId('useful-life-alert-row-asset-ul-1')).getByText(
        'ONT-01 · SN-UL-001',
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('useful-life-alert-row-asset-ul-1')).getByText(
        getUsefulLifeStatusLabel('por-vencer'),
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('useful-life-alert-row-asset-ul-2')).getByText(
        getUsefulLifeStatusLabel('vencida'),
      ),
    ).toBeInTheDocument();

    fireEvent.click(
      within(screen.getByTestId('useful-life-alert-row-asset-ul-1')).getByRole('button', {
        name: 'Ver ficha 360',
      }),
    );
    expect(onOpenAssetDetail).toHaveBeenCalledWith('asset-ul-1');
  });

  it('filtra por estado y expone CTA de reposición', async () => {
    const user = userEvent.setup();
    const onNavigateToReplenishment = jest.fn();
    listUsefulLifeAlertsMock.mockResolvedValue({
      data: [buildAlert({ status: 'vencida', monthsRemaining: -1 })],
      total: 1,
      page: 1,
      limit: 20,
      pageSize: 20,
    });

    const { rerender } = render(
      <UsefulLifeAlertsPanel
        onOpenAssetDetail={jest.fn()}
        onNavigateToReplenishment={onNavigateToReplenishment}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('useful-life-alerts-panel')).toBeInTheDocument();
    });

    expect(screen.getByTestId('useful-life-alerts-status-filter')).toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: 'Estado' }));
    await user.click(
      await screen.findByRole('option', { name: USEFUL_LIFE_STATUS_LABELS.vencida }),
    );
    rerender(
      <UsefulLifeAlertsPanel
        onOpenAssetDetail={jest.fn()}
        onNavigateToReplenishment={onNavigateToReplenishment}
      />,
    );

    await waitFor(() => {
      expect(listUsefulLifeAlertsMock).toHaveBeenCalledWith({
        status: 'vencida',
        page: 1,
        pageSize: 20,
      });
    });

    fireEvent.click(screen.getByTestId('useful-life-alerts-replenishment-cta'));
    expect(onNavigateToReplenishment).toHaveBeenCalledTimes(1);
  });

  it('muestra estado vacío cuando no hay alertas', async () => {
    listUsefulLifeAlertsMock.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
      pageSize: 20,
    });

    render(<UsefulLifeAlertsPanel onOpenAssetDetail={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Sin alertas de vida útil')).toBeInTheDocument();
    });
  });

  it('ADR-065: reemplaza página (conjuntos disjuntos, sin Cargar más)', async () => {
    const user = userEvent.setup();
    const page1 = Array.from({ length: 20 }, (_, i) =>
      buildAlert({ id: `asset-p1-${i}`, serialNumber: `SN-P1-${i}` }),
    );
    const page2 = Array.from({ length: 20 }, (_, i) =>
      buildAlert({
        id: `asset-p2-${i}`,
        serialNumber: `SN-P2-${i}`,
        status: 'vencida',
        monthsRemaining: 0,
      }),
    );

    listUsefulLifeAlertsMock.mockImplementation(async (params?: { page?: number }) => {
      const page = params?.page ?? 1;
      return {
        data: page === 1 ? page1 : page2,
        total: 40,
        page,
        limit: 20,
        pageSize: 20,
      };
    });

    const { rerender } = render(<UsefulLifeAlertsPanel onOpenAssetDetail={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('useful-life-alert-row-asset-p1-0')).toBeInTheDocument();
    });
    expect(screen.getAllByText(/Mostrando 1\u201320 de 40 alertas/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    rerender(<UsefulLifeAlertsPanel onOpenAssetDetail={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('useful-life-alert-row-asset-p2-0')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('useful-life-alert-row-asset-p1-0')).not.toBeInTheDocument();
    expect(listUsefulLifeAlertsMock).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, pageSize: 20 }),
    );
  });
});
