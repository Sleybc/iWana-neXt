import { DataSource } from 'typeorm';
import { SerializedAssetStatus } from '@iwana/shared';
import { SerializedAssetService } from '../services/serialized-asset.service';

jest.mock('@iwana/db', () => ({
  SerializedAsset: class SerializedAsset {},
  InventoryItem: class InventoryItem {},
  InventoryCategory: class InventoryCategory {},
  StockLocation: class StockLocation {},
  PurchaseOrder: class PurchaseOrder {},
  GoodsReceipt: class GoodsReceipt {},
  StockMovement: class StockMovement {},
  StockMovementLine: class StockMovementLine {},
  TenantContext: {
    getOrThrow: jest.fn(),
  },
  runInTenantSchema: jest.fn(),
}));

const iwanaDb = require('@iwana/db') as {
  TenantContext: { getOrThrow: jest.Mock };
  runInTenantSchema: jest.Mock;
  SerializedAsset: { name: string };
  InventoryItem: { name: string };
};

describe('useful-life-alerts aislamiento tenant', () => {
  let currentTenant = { tenantId: 'tenant-a', schemaName: 'tenant_a' };
  const assetsBySchema = new Map<string, Array<Record<string, unknown>>>();

  function seed(schemaName: string, assets: Array<Record<string, unknown>>): void {
    assetsBySchema.set(schemaName, assets);
  }

  function managerFor(schemaName: string) {
    return {
      find: jest.fn(async (entity: { name: string }) => {
        if (entity.name === 'SerializedAsset') {
          return (assetsBySchema.get(schemaName) ?? []).filter(
            (asset) => asset.tenantId === currentTenant.tenantId,
          );
        }
        if (entity.name === 'InventoryItem') {
          return [{ id: 'item-1', sku: 'SKU', name: 'ONT' }];
        }
        return [];
      }),
    };
  }

  let service: SerializedAssetService;

  beforeAll(() => {
    iwanaDb.TenantContext.getOrThrow.mockImplementation(() => currentTenant);
    iwanaDb.runInTenantSchema.mockImplementation(
      async (_ds: unknown, schemaName: string, cb: (qr: { manager: unknown }) => unknown) =>
        cb({ manager: managerFor(schemaName) }),
    );

    service = new SerializedAssetService(
      {} as DataSource,
      { listPaginatedForAsset: jest.fn() } as never,
      { list: jest.fn() } as never,
      { getSupplierSummariesBatch: jest.fn() } as never,
      { listForAsset: jest.fn() } as never,
    );

    jest.useFakeTimers().setSystemTime(new Date('2026-07-21T00:00:00.000Z'));

    seed('tenant_a', [
      {
        id: 'asset-a',
        tenantId: 'tenant-a',
        inventoryItemId: 'item-1',
        serialNumber: 'A-1',
        assetTag: null,
        currentStatus: SerializedAssetStatus.AVAILABLE,
        usefulLifeMonths: 6,
        purchaseDate: '2025-01-01',
        warrantyUntil: null,
        updatedAt: new Date(),
      },
    ]);
    seed('tenant_b', [
      {
        id: 'asset-b',
        tenantId: 'tenant-b',
        inventoryItemId: 'item-1',
        serialNumber: 'B-1',
        assetTag: null,
        currentStatus: SerializedAssetStatus.AVAILABLE,
        usefulLifeMonths: 6,
        purchaseDate: '2025-01-01',
        warrantyUntil: null,
        updatedAt: new Date(),
      },
    ]);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('no filtra activos de otro schema', async () => {
    currentTenant = { tenantId: 'tenant-a', schemaName: 'tenant_a' };
    const resultA = await service.listUsefulLifeAlerts({
      status: 'vencida',
      page: 1,
      pageSize: 20,
    });
    expect(resultA.data.map((row) => row.id)).toEqual(['asset-a']);

    currentTenant = { tenantId: 'tenant-b', schemaName: 'tenant_b' };
    const resultB = await service.listUsefulLifeAlerts({
      status: 'vencida',
      page: 1,
      pageSize: 20,
    });
    expect(resultB.data.map((row) => row.id)).toEqual(['asset-b']);
  });
});
