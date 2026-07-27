import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StockMovementOrigin } from '@iwana/shared';
import { inventoryApi } from '@/lib/api-client';
import { StockKardexPanel } from './StockKardexPanel';
import { formatInventoryCostOrNone, INVENTORY_UNIT_COST_LABEL } from './inventory-labels';

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
      listMovements: jest.fn(),
    },
  };
});

const listMovementsMock = inventoryApi.listMovements as jest.Mock;

function movementFixture(
  id: string,
  number: string,
  origin = StockMovementOrigin.PURCHASE_RECEIPT,
) {
  return {
    id,
    movementNumber: number,
    origin,
    originContext: 'inventory',
    originRefId: null,
    adjustmentReason: null,
    notes: null,
    actorUserId: null,
    isReversal: false,
    createdAt: '2026-07-01T10:00:00.000Z',
    lines: [] as Array<Record<string, unknown>>,
  };
}

describe('StockKardexPanel ADR-065', () => {
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

  it('loads and renders kardex movements', async () => {
    listMovementsMock.mockResolvedValue({
      data: [
        {
          ...movementFixture('mov-001', 'MOV-000001'),
          lines: [
            {
              id: 'line-001',
              itemId: 'item-001',
              itemName: 'Cable',
              itemSku: 'CAB-01',
              locationId: 'loc-001',
              locationName: 'Central',
              lotId: null,
              lotNumber: null,
              serializedAssetId: null,
              quantity: '5.00',
              unitCost: null,
            },
          ],
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    });

    render(<StockKardexPanel />);

    await waitFor(() => {
      expect(screen.getByText('MOV-000001')).toBeInTheDocument();
    });
    expect(listMovementsMock).toHaveBeenCalled();
  });

  it('ADR-065: reemplaza página (conjuntos disjuntos, sin Cargar más)', async () => {
    listMovementsMock.mockImplementation(async (params?: { page?: number }) => {
      const page = params?.page ?? 1;
      const data =
        page === 1
          ? Array.from({ length: 20 }, (_, i) =>
              movementFixture(`mov-p1-${i}`, `MOV-P1-${String(i).padStart(3, '0')}`),
            )
          : Array.from({ length: 20 }, (_, i) =>
              movementFixture(
                `mov-p2-${i}`,
                `MOV-P2-${String(i).padStart(3, '0')}`,
                StockMovementOrigin.SALE,
              ),
            );
      return { data, total: 40, page, limit: 20 };
    });

    const user = userEvent.setup();
    const { rerender } = render(<StockKardexPanel />);

    await waitFor(() => {
      expect(screen.getByText('MOV-P1-000')).toBeInTheDocument();
    });
    expect(screen.getAllByText(/Mostrando 1\u201320 de 40 movimientos/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    rerender(<StockKardexPanel />);

    await waitFor(() => {
      expect(screen.getByText('MOV-P2-000')).toBeInTheDocument();
    });
    expect(screen.queryByText('MOV-P1-000')).not.toBeInTheDocument();
  });

  it('muestra costo unitario en líneas de salida cuando viene poblado (CA-F4-05)', async () => {
    const user = userEvent.setup();
    listMovementsMock.mockResolvedValue({
      data: [
        {
          id: 'mov-out-001',
          movementNumber: 'MOV-000042',
          origin: StockMovementOrigin.SALE,
          originContext: 'inventory.sale',
          originRefId: null,
          adjustmentReason: null,
          notes: null,
          actorUserId: null,
          isReversal: false,
          createdAt: '2026-07-02T10:00:00.000Z',
          lines: [
            {
              id: 'line-out-001',
              itemId: 'item-001',
              itemName: 'Cable',
              itemSku: 'CAB-01',
              locationId: 'loc-001',
              locationName: 'Central',
              lotId: null,
              lotNumber: null,
              serializedAssetId: null,
              quantity: '-2.00',
              unitCost: '116500.00',
            },
          ],
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    });

    render(<StockKardexPanel />);

    await waitFor(() => {
      expect(screen.getByText('MOV-000042')).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText('Expandir líneas'));

    const expectedCost = formatInventoryCostOrNone('116500.00');
    expect(
      screen.getByText((_, element) => {
        if (element?.tagName !== 'LI') {
          return false;
        }
        const text = element.textContent ?? '';
        return text.includes(INVENTORY_UNIT_COST_LABEL) && text.includes(expectedCost);
      }),
    ).toBeInTheDocument();
  });
});
