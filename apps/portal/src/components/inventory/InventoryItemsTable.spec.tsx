import { render, screen, within } from '@testing-library/react';
import {
  InventoryItemCategory,
  InventoryItemKind,
  InventoryItemStatus,
  InventoryTrackingMode,
} from '@iwana/shared';
import type { InventoryItemRecord } from '@/lib/api-client';
import { InventoryItemsTable } from './InventoryItemsTable';
import {
  formatInventoryCostOrNone,
  formatInventoryCurrency,
  INVENTORY_AVERAGE_COST_LABEL,
  INVENTORY_NO_COST_LABEL,
} from './inventory-labels';

const baseItem: InventoryItemRecord = {
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

describe('InventoryItemsTable · costo promedio (G6 / D-F4-9)', () => {
  it('header y celda muestran solo averageCost, no la cadena de valoración', () => {
    render(<InventoryItemsTable items={[baseItem]} showCatalogColumns />);

    expect(
      screen.getByRole('columnheader', { name: INVENTORY_AVERAGE_COST_LABEL }),
    ).toBeInTheDocument();

    const row = screen.getByRole('row', { name: /ONT WiFi 6/i });
    expect(
      within(row).getByText(
        (_, element) => element?.textContent === formatInventoryCostOrNone('116500'),
      ),
    ).toBeInTheDocument();
    expect(within(row).queryByText(formatInventoryCurrency('115000'))).not.toBeInTheDocument();
    expect(within(row).queryByText(formatInventoryCurrency('118000'))).not.toBeInTheDocument();
    expect(within(row).queryByText(formatInventoryCurrency('120000'))).not.toBeInTheDocument();
  });

  it('muestra Sin costo cuando averageCost es 0 aunque existan fallbacks de valoración', () => {
    render(
      <InventoryItemsTable
        items={[
          {
            ...baseItem,
            averageCost: '0',
            lastPurchaseCost: '115000',
            standardCost: '118000',
            baseCost: '120000',
          },
        ]}
        showCatalogColumns
      />,
    );

    const row = screen.getByRole('row', { name: /ONT WiFi 6/i });
    expect(within(row).getByText(INVENTORY_NO_COST_LABEL)).toBeInTheDocument();
    expect(within(row).queryByText(formatInventoryCurrency('115000'))).not.toBeInTheDocument();
  });
});
