import { render, screen } from '@testing-library/react';
import {
  InventoryCategoryStatus,
  InventoryItemCategory,
  InventoryItemKind,
  InventoryItemStatus,
  InventoryTrackingMode,
} from '@iwana/shared';
import type { InventoryCategoryRecord, InventoryItemRecord } from '@/lib/api-client';
import { InventoryCatalogDrawer } from './InventoryCatalogDrawer';
import {
  formatInventoryCostOrNone,
  INVENTORY_AVERAGE_COST_HELP_TEXT,
  INVENTORY_AVERAGE_COST_LABEL,
  INVENTORY_LAST_PURCHASE_COST_LABEL,
  INVENTORY_NO_COST_LABEL,
  INVENTORY_STANDARD_COST_LABEL,
} from './inventory-labels';

const item: InventoryItemRecord = {
  id: 'item-1',
  tenantId: 'tenant-1',
  sku: 'ONT-001',
  name: 'ONT WiFi 6',
  description: null,
  brand: 'FiberCo',
  model: 'X6',
  itemKind: InventoryItemKind.SERIALIZED,
  category: InventoryItemCategory.CPE,
  categoryId: 'cat-cpe',
  categoryName: 'CPE',
  categoryCode: 'CPE',
  trackingMode: InventoryTrackingMode.SERIALIZED,
  unitOfMeasure: 'unidad',
  baseCost: '120000',
  minimumStock: '2',
  purchasable: true,
  inventoryControlled: true,
  assetControlled: true,
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
  usefulLifeMonths: 36,
  commercialReferenceId: null,
  status: InventoryItemStatus.ACTIVE,
  createdAt: '2026-06-25T12:00:00.000Z',
  updatedAt: '2026-06-25T12:00:00.000Z',
};

const categories: InventoryCategoryRecord[] = [
  {
    id: 'cat-cpe',
    tenantId: 'tenant-1',
    code: 'CPE',
    codePrefix: 'CPE',
    name: 'CPE',
    description: null,
    status: InventoryCategoryStatus.ACTIVE,
    sortOrder: 1,
    productCount: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

describe('InventoryCatalogDrawer · costos F4', () => {
  it('muestra costo promedio y último costo de compra con ayuda (CA-F4-05)', () => {
    render(
      <InventoryCatalogDrawer
        open
        item={item}
        categories={categories}
        commercialProductOptions={[]}
        isSubmitting={false}
        error={null}
        onClose={jest.fn()}
        onUpdate={jest.fn()}
      />,
    );

    expect(screen.getByText(INVENTORY_AVERAGE_COST_LABEL)).toBeInTheDocument();
    expect(screen.getByText(INVENTORY_LAST_PURCHASE_COST_LABEL)).toBeInTheDocument();
    expect(screen.getByText(INVENTORY_STANDARD_COST_LABEL)).toBeInTheDocument();
    expect(screen.getByText(INVENTORY_AVERAGE_COST_HELP_TEXT)).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, element) => element?.textContent === formatInventoryCostOrNone('116500'),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, element) => element?.textContent === formatInventoryCostOrNone('115000'),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, element) => element?.textContent === formatInventoryCostOrNone('118000'),
      ),
    ).toBeInTheDocument();
  });

  it('muestra Sin costo cuando averageCost es 0', () => {
    render(
      <InventoryCatalogDrawer
        open
        item={{ ...item, averageCost: '0', lastPurchaseCost: null }}
        categories={categories}
        commercialProductOptions={[]}
        isSubmitting={false}
        error={null}
        onClose={jest.fn()}
        onUpdate={jest.fn()}
      />,
    );

    expect(screen.getAllByText(INVENTORY_NO_COST_LABEL).length).toBeGreaterThanOrEqual(1);
  });

  it('muestra Sin costo cuando standardCost es 0 (mismo empty que promedio/último)', () => {
    render(
      <InventoryCatalogDrawer
        open
        item={{ ...item, standardCost: '0' }}
        categories={categories}
        commercialProductOptions={[]}
        isSubmitting={false}
        error={null}
        onClose={jest.fn()}
        onUpdate={jest.fn()}
      />,
    );

    const standardLabel = screen.getByText(INVENTORY_STANDARD_COST_LABEL);
    const tile = standardLabel.closest('div');
    expect(tile).toHaveTextContent(INVENTORY_NO_COST_LABEL);
  });
});
