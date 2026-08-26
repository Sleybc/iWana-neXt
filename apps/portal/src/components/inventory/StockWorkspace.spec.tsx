import { act, render, screen } from '@testing-library/react';
import { InventoryItemKind, InventoryTrackingMode } from '@iwana/shared';
import type { InventoryItemRecord } from '@/lib/api-client';
import { StockWorkspace } from './StockWorkspace';

const inventoryApiMock = {
  getItem: jest.fn(),
};

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client') as Record<string, unknown>;
  return {
    ...actual,
    inventoryApi: {
      getItem: (...args: unknown[]) => inventoryApiMock.getItem(...args),
    },
  };
});

let lastDetailProps: { open: boolean; item: InventoryItemRecord | null } | null = null;
let capturedOnViewDetail: ((itemId: string) => void) | null = null;

jest.mock('./StockByProductTable', () => ({
  StockByProductTable: ({ onViewDetail }: { onViewDetail: (itemId: string) => void }) => {
    capturedOnViewDetail = onViewDetail;
    return <div>Tabla por producto</div>;
  },
}));

jest.mock('./StockLocationsMatrix', () => ({
  StockLocationsMatrix: () => <div>Matriz por bodega</div>,
}));

jest.mock('./StockKardexPanel', () => ({
  StockKardexPanel: () => <div>Panel kardex</div>,
}));

jest.mock('./StockReplenishmentPanel', () => ({
  StockReplenishmentPanel: () => <div>Panel reposición</div>,
}));

jest.mock('./StockItemDetailDrawer', () => ({
  StockItemDetailDrawer: (props: { open: boolean; item: InventoryItemRecord | null }) => {
    lastDetailProps = props;
    return props.open && props.item ? <div>Detalle {props.item.sku}</div> : null;
  },
}));

jest.mock('./StockAdjustmentDialog', () => ({
  StockAdjustmentDialog: () => null,
}));

function makeItem(overrides: Partial<InventoryItemRecord> = {}): InventoryItemRecord {
  return {
    id: 'item-001',
    tenantId: 'tenant-001',
    sku: 'CAB-01',
    name: 'Cable drop',
    unitOfMeasure: 'm',
    itemKind: InventoryItemKind.STOCK,
    trackingMode: InventoryTrackingMode.CONSUMABLE,
    minimumStock: '0',
    reorderPoint: '0',
    targetStock: '0',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as InventoryItemRecord;
}

describe('StockWorkspace', () => {
  beforeEach(() => {
    lastDetailProps = null;
    capturedOnViewDetail = null;
    inventoryApiMock.getItem.mockReset();
  });

  it('renders the stock subviews including replenishment', () => {
    render(
      <StockWorkspace items={[]} balances={[]} locations={[]} onAdjustmentRegistered={jest.fn()} />,
    );

    expect(screen.getByText('Por producto')).toBeInTheDocument();
    expect(screen.getByText('Por bodega')).toBeInTheDocument();
    expect(screen.getByText('Kardex')).toBeInTheDocument();
    expect(screen.getByText('Reposición')).toBeInTheDocument();
    expect(screen.getByText('Tabla por producto')).toBeInTheDocument();
    const productTab = screen.getByRole('tab', { name: 'Por producto', selected: true });
    expect(productTab).toHaveClass('border-iwana-secondary');
    expect(productTab).not.toHaveClass('bg-iwana-primary');
  });

  it('abre Por bodega cuando el filtro de custodia es móvil', () => {
    render(
      <StockWorkspace
        items={[]}
        balances={[]}
        locations={[]}
        custodyFilter="mobile"
        onAdjustmentRegistered={jest.fn()}
      />,
    );

    expect(screen.getByRole('tab', { name: 'Por bodega', selected: true })).toBeInTheDocument();
    expect(screen.getByText('Matriz por bodega')).toBeInTheDocument();
  });

  it('conserva el side peek al reemplazar la página de productos', async () => {
    const item = makeItem();
    const { rerender } = render(
      <StockWorkspace
        items={[item]}
        balances={[]}
        locations={[]}
        onAdjustmentRegistered={jest.fn()}
      />,
    );

    await act(async () => {
      capturedOnViewDetail?.(item.id);
    });

    expect(screen.getByText('Detalle CAB-01')).toBeInTheDocument();
    expect(lastDetailProps?.open).toBe(true);

    rerender(
      <StockWorkspace
        items={[makeItem({ id: 'item-002', sku: 'CAB-02', name: 'Otro' })]}
        balances={[]}
        locations={[]}
        onAdjustmentRegistered={jest.fn()}
      />,
    );

    expect(screen.getByText('Detalle CAB-01')).toBeInTheDocument();
    expect(lastDetailProps?.item?.id).toBe('item-001');
    expect(inventoryApiMock.getItem).not.toHaveBeenCalled();
  });
});
