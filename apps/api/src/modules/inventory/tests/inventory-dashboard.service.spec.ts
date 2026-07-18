import { DataSource } from 'typeorm';
import { InventoryDashboardService } from '../services/inventory-dashboard.service';

jest.mock('@iwana/db', () => ({
  InventoryCategory: class InventoryCategory {},
  InventoryItem: class InventoryItem {},
  SerializedAsset: class SerializedAsset {},
  StockBalance: class StockBalance {},
  StockLocation: class StockLocation {},
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    }),
  },
  runInTenantSchema: jest.fn(),
}));

import {
  InventoryCategory,
  InventoryItem,
  SerializedAsset,
  StockBalance,
  StockLocation,
  runInTenantSchema,
} from '@iwana/db';

describe('InventoryDashboardService', () => {
  const runInTenantSchemaMock = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calcula estimatedTotalValue y estimatedValue por categoría con costo D-F2-4', async () => {
    const items = [
      {
        id: 'item-001',
        categoryId: 'cat-001',
        lastPurchaseCost: '10.00',
        standardCost: '8.00',
        baseCost: '5.00',
      },
      {
        id: 'item-002',
        categoryId: 'cat-002',
        lastPurchaseCost: null,
        standardCost: null as unknown as string,
        baseCost: '4.00',
      },
      {
        id: 'item-003',
        categoryId: 'cat-002',
        lastPurchaseCost: null,
        standardCost: '0.00',
        baseCost: '9.00',
      },
    ];
    const categories = [
      { id: 'cat-001', codePrefix: 'CAB', name: 'Cables' },
      { id: 'cat-002', codePrefix: 'ONU', name: 'ONUs' },
    ];
    const balances = [
      { itemId: 'item-001', locationId: 'loc-001', quantityOnHand: '3.00' },
      { itemId: 'item-002', locationId: 'loc-001', quantityOnHand: '2.00' },
      { itemId: 'item-003', locationId: 'loc-001', quantityOnHand: '1.00' },
    ];
    const locations = [{ id: 'loc-001', code: 'BC', name: 'Bodega central' }];

    const manager = {
      find: jest.fn().mockImplementation((entity: unknown) => {
        if (entity === InventoryItem) {
          return Promise.resolve(items);
        }

        if (entity === StockLocation) {
          return Promise.resolve(locations);
        }

        if (entity === SerializedAsset) {
          return Promise.resolve([]);
        }

        if (entity === StockBalance) {
          return Promise.resolve(balances);
        }

        if (entity === InventoryCategory) {
          return Promise.resolve(categories);
        }

        return Promise.resolve([]);
      }),
    };

    runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) =>
      work({ manager } as never),
    );

    const service = new InventoryDashboardService({} as DataSource);
    const summary = await service.getSummary();

    // item-001: 3 * 10 = 30; item-002: 2 * 4 = 8 (standardCost null → baseCost);
    // item-003: 1 * 0 = 0 (standardCost '0.00' gana por ??, no cae a baseCost)
    expect(summary.estimatedTotalValue).toBe(38);
    expect(summary.totalOnHand).toBe(6);
    expect(summary.balancesByCategory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          categoryId: 'cat-001',
          totalOnHand: 3,
          estimatedValue: 30,
        }),
        expect.objectContaining({
          categoryId: 'cat-002',
          totalOnHand: 3,
          estimatedValue: 8,
        }),
      ]),
    );
  });

  it('mantiene campos existentes del summary', async () => {
    const manager = {
      find: jest.fn().mockResolvedValue([]),
    };

    runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) =>
      work({ manager } as never),
    );

    const service = new InventoryDashboardService({} as DataSource);
    const summary = await service.getSummary();

    expect(summary).toMatchObject({
      itemsCount: 0,
      locationsCount: 0,
      serializedAssetsCount: 0,
      balancesCount: 0,
      totalOnHand: 0,
      estimatedTotalValue: 0,
      balancesByLocation: [],
      balancesByCategory: [],
      serializedAssetsByStatus: [],
      serializedAssetsByResponsibleType: [],
    });
  });
});
