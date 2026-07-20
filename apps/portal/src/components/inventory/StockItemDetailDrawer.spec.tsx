import { render, screen, waitFor } from '@testing-library/react';
import {
  InventoryItemCategory,
  InventoryItemKind,
  InventoryItemStatus,
  InventoryTrackingMode,
} from '@iwana/shared';
import { inventoryApi, type InventoryItemRecord } from '@/lib/api-client';
import { StockItemDetailDrawer } from './StockItemDetailDrawer';
import {
  formatInventoryCostOrNone,
  INVENTORY_AVERAGE_COST_LABEL,
  INVENTORY_LAST_PURCHASE_COST_LABEL,
  INVENTORY_NO_COST_LABEL,
} from './inventory-labels';

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

const item: InventoryItemRecord = {
  id: 'item-1',
  tenantId: 'tenant-1',
  sku: 'ONT-001',
  name: 'ONT WiFi 6',
  description: null,
  brand: 'FiberCo',
  model: 'X6',
  itemKind: InventoryItemKind.STOCK,
  category: InventoryItemCategory.CPE,
  categoryId: 'cat-cpe',
  categoryName: 'CPE',
  categoryCode: 'CPE',
  trackingMode: InventoryTrackingMode.CONSUMABLE,
  unitOfMeasure: 'unidad',
  baseCost: '120000',
  minimumStock: '2',
  purchasable: true,
  inventoryControlled: true,
  assetControlled: false,
  preferredSupplierRefId: null,
  supplierSku: null,
  purchaseUnitOfMeasure: null,
  purchaseToBaseUomFactor: null,
  standardCost: '118000',
  lastPurchaseCost: '115000',
  averageCost: '116500',
  reorderPoint: '5',
  targetStock: '20',
  minimumOrderQty: null,
  orderMultiple: null,
  leadTimeDays: null,
  usefulLifeMonths: null,
  commercialReferenceId: null,
  status: InventoryItemStatus.ACTIVE,
  createdAt: '2026-06-25T12:00:00.000Z',
  updatedAt: '2026-06-25T12:00:00.000Z',
};

describe('StockItemDetailDrawer · costos F4 / G6 P2', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listMovementsMock.mockResolvedValue({ data: [], total: 0, page: 1, limit: 10 });
  });

  it('usa meta-tiles de catálogo (surface-soft + eyebrow-muted) para costos', async () => {
    render(
      <StockItemDetailDrawer open item={item} balances={[]} locations={[]} onClose={jest.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByText(INVENTORY_AVERAGE_COST_LABEL)).toBeInTheDocument();
    });

    const averageLabel = screen.getByText(INVENTORY_AVERAGE_COST_LABEL);
    const averageTile = averageLabel.closest('div');
    expect(averageTile).toHaveClass(
      'rounded-2xl',
      'bg-iwana-surface-soft',
      'dark:bg-dark-surface-3',
    );
    expect(averageLabel).toHaveClass('portal-eyebrow-muted');
    expect(
      screen.getByText(
        (_, element) => element?.textContent === formatInventoryCostOrNone('116500'),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(INVENTORY_LAST_PURCHASE_COST_LABEL)).toBeInTheDocument();
  });

  it('muestra Sin costo cuando averageCost y lastPurchaseCost están vacíos', async () => {
    render(
      <StockItemDetailDrawer
        open
        item={{ ...item, averageCost: '0', lastPurchaseCost: null }}
        balances={[]}
        locations={[]}
        onClose={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByText(INVENTORY_NO_COST_LABEL).length).toBeGreaterThanOrEqual(2);
    });
  });
});
