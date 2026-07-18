import {
  InventoryItemCategory,
  InventoryItemKind,
  InventoryItemStatus,
  InventoryTrackingMode,
  StockBalanceCondition,
} from '@iwana/shared';
import type { InventoryItemRecord, StockBalanceRecord } from '@/lib/api-client';
import {
  buildStockOverviewRows,
  deriveStockOverviewStatus,
  filterStockOverviewRows,
  isStockAdjustableItem,
} from './stock-overview';

function makeItem(overrides: Partial<InventoryItemRecord> = {}): InventoryItemRecord {
  return {
    id: 'item-001',
    tenantId: 'tenant-001',
    sku: 'CAB-01',
    name: 'Cable UTP',
    description: null,
    brand: null,
    model: null,
    itemKind: InventoryItemKind.STOCK,
    category: InventoryItemCategory.OTHER,
    categoryId: 'cat-001',
    categoryName: 'Otros',
    categoryCode: 'OTH',
    trackingMode: InventoryTrackingMode.CONSUMABLE,
    unitOfMeasure: 'UND',
    baseCost: '0',
    minimumStock: '5',
    purchasable: true,
    inventoryControlled: true,
    assetControlled: false,
    preferredSupplierRefId: null,
    supplierSku: null,
    purchaseUnitOfMeasure: null,
    purchaseToBaseUomFactor: null,
    standardCost: '0',
    lastPurchaseCost: null,
    reorderPoint: '10',
    targetStock: '20',
    minimumOrderQty: '1',
    orderMultiple: null,
    leadTimeDays: null,
    usefulLifeMonths: null,
    commercialReferenceId: null,
    status: InventoryItemStatus.ACTIVE,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeBalance(overrides: Partial<StockBalanceRecord> = {}): StockBalanceRecord {
  return {
    id: 'bal-001',
    tenantId: 'tenant-001',
    itemId: 'item-001',
    locationId: 'loc-001',
    lotId: null,
    condition: StockBalanceCondition.NEW,
    quantityOnHand: '8',
    quantityReserved: '1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('stock-overview', () => {
  it('derives status from available vs thresholds', () => {
    expect(deriveStockOverviewStatus({ available: 0, minimumStock: 5, reorderPoint: 10 })).toBe(
      'out',
    );
    expect(deriveStockOverviewStatus({ available: 3, minimumStock: 5, reorderPoint: 10 })).toBe(
      'below-minimum',
    );
    expect(deriveStockOverviewStatus({ available: 7, minimumStock: 5, reorderPoint: 10 })).toBe(
      'below-reorder',
    );
    expect(deriveStockOverviewStatus({ available: 12, minimumStock: 5, reorderPoint: 10 })).toBe(
      'ok',
    );
  });

  it('aggregates balances by item and computes available', () => {
    const rows = buildStockOverviewRows(
      [makeItem()],
      [
        makeBalance({ quantityOnHand: '8', quantityReserved: '1' }),
        makeBalance({
          id: 'bal-002',
          locationId: 'loc-002',
          quantityOnHand: '2',
          quantityReserved: '0',
        }),
      ],
    );

    expect(rows[0]?.onHand).toBe(10);
    expect(rows[0]?.reserved).toBe(1);
    expect(rows[0]?.available).toBe(9);
    expect(rows[0]?.status).toBe('below-reorder');
  });

  it('con reservas reales el disponible baja sin alterar la existencia', () => {
    const rows = buildStockOverviewRows(
      [makeItem({ reorderPoint: '0', minimumStock: '0' })],
      [makeBalance({ quantityOnHand: '12', quantityReserved: '8' })],
    );

    expect(rows[0]?.onHand).toBe(12);
    expect(rows[0]?.reserved).toBe(8);
    expect(rows[0]?.available).toBe(4);
  });

  it('filters by search and below-minimum', () => {
    const rows = buildStockOverviewRows(
      [makeItem(), makeItem({ id: 'item-002', sku: 'ONU-01', name: 'ONU', minimumStock: '1' })],
      [
        makeBalance({ quantityOnHand: '2', quantityReserved: '0' }),
        makeBalance({
          id: 'bal-003',
          itemId: 'item-002',
          quantityOnHand: '5',
          quantityReserved: '0',
        }),
      ],
    );

    expect(filterStockOverviewRows(rows, { search: 'onu' })).toHaveLength(1);
    expect(filterStockOverviewRows(rows, { onlyBelowMinimum: true })).toHaveLength(1);
  });

  it('marca serializados como no ajustables', () => {
    expect(isStockAdjustableItem(makeItem())).toBe(true);
    expect(
      isStockAdjustableItem(
        makeItem({
          itemKind: InventoryItemKind.SERIALIZED,
          trackingMode: InventoryTrackingMode.SERIALIZED,
        }),
      ),
    ).toBe(false);
  });
});
