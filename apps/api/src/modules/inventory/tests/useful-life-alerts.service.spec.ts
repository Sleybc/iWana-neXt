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
    getOrThrow: jest.fn().mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    }),
  },
  runInTenantSchema: jest.fn(),
}));

import { runInTenantSchema, TenantContext } from '@iwana/db';

describe('SerializedAssetService.listUsefulLifeAlerts', () => {
  const runInTenantSchemaMock = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;

  function buildService(manager: { find: jest.Mock }): SerializedAssetService {
    return new SerializedAssetService(
      {} as DataSource,
      { listPaginatedForAsset: jest.fn() } as never,
      { list: jest.fn() } as never,
      { getSupplierSummariesBatch: jest.fn() } as never,
      { listForAsset: jest.fn() } as never,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (TenantContext.getOrThrow as jest.Mock).mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    });
  });

  it('filtra por-vencer y excluye vigente/sin-dato', async () => {
    const reference = new Date('2026-07-21T00:00:00.000Z');
    jest.useFakeTimers().setSystemTime(reference);

    const manager = {
      find: jest.fn().mockImplementation(async (entity: { name: string }) => {
        if (entity.name === 'SerializedAsset') {
          return [
            {
              id: 'asset-por-vencer',
              inventoryItemId: 'item-1',
              serialNumber: 'SN-1',
              assetTag: null,
              currentStatus: SerializedAssetStatus.AVAILABLE,
              usefulLifeMonths: 12,
              purchaseDate: '2025-08-01',
              warrantyUntil: null,
              updatedAt: new Date(),
            },
            {
              id: 'asset-vigente',
              inventoryItemId: 'item-1',
              serialNumber: 'SN-2',
              assetTag: null,
              currentStatus: SerializedAssetStatus.AVAILABLE,
              usefulLifeMonths: 36,
              purchaseDate: '2025-01-01',
              warrantyUntil: null,
              updatedAt: new Date(),
            },
            {
              id: 'asset-sin-dato',
              inventoryItemId: 'item-1',
              serialNumber: 'SN-3',
              assetTag: null,
              currentStatus: SerializedAssetStatus.AVAILABLE,
              usefulLifeMonths: null,
              purchaseDate: null,
              warrantyUntil: null,
              updatedAt: new Date(),
            },
          ];
        }

        return [{ id: 'item-1', sku: 'SKU-1', name: 'ONT' }];
      }),
    };

    runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) =>
      work({ manager } as never),
    );

    const service = buildService(manager);
    const result = await service.listUsefulLifeAlerts({
      status: 'por-vencer',
      page: 1,
      pageSize: 20,
    });

    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.id).toBe('asset-por-vencer');
    expect(result.data[0]?.status).toBe('por-vencer');
    expect(result.data[0]?.sku).toBe('SKU-1');
    expect(result.limit).toBe(20);

    jest.useRealTimers();
  });

  it('filtra vencida', async () => {
    const reference = new Date('2026-07-21T00:00:00.000Z');
    jest.useFakeTimers().setSystemTime(reference);

    const manager = {
      find: jest.fn().mockImplementation(async (entity: { name: string }) => {
        if (entity.name === 'SerializedAsset') {
          return [
            {
              id: 'asset-vencida',
              inventoryItemId: 'item-1',
              serialNumber: 'SN-V',
              assetTag: null,
              currentStatus: SerializedAssetStatus.AVAILABLE,
              usefulLifeMonths: 6,
              purchaseDate: '2025-01-01',
              warrantyUntil: null,
              updatedAt: new Date(),
            },
          ];
        }

        return [{ id: 'item-1', sku: 'SKU-1', name: 'ONT' }];
      }),
    };

    runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) =>
      work({ manager } as never),
    );

    const service = buildService(manager);
    const result = await service.listUsefulLifeAlerts({ status: 'vencida', page: 1, pageSize: 10 });

    expect(result.total).toBe(1);
    expect(result.data[0]?.status).toBe('vencida');

    jest.useRealTimers();
  });

  it('sin status incluye por-vencer y vencida', async () => {
    const reference = new Date('2026-07-21T00:00:00.000Z');
    jest.useFakeTimers().setSystemTime(reference);

    const manager = {
      find: jest.fn().mockImplementation(async (entity: { name: string }) => {
        if (entity.name === 'SerializedAsset') {
          return [
            {
              id: 'asset-por-vencer',
              inventoryItemId: 'item-1',
              serialNumber: 'SN-1',
              assetTag: null,
              currentStatus: SerializedAssetStatus.AVAILABLE,
              usefulLifeMonths: 12,
              purchaseDate: '2025-08-01',
              warrantyUntil: null,
              updatedAt: new Date(),
            },
            {
              id: 'asset-vencida',
              inventoryItemId: 'item-1',
              serialNumber: 'SN-V',
              assetTag: null,
              currentStatus: SerializedAssetStatus.AVAILABLE,
              usefulLifeMonths: 6,
              purchaseDate: '2025-01-01',
              warrantyUntil: null,
              updatedAt: new Date(),
            },
            {
              id: 'asset-vigente',
              inventoryItemId: 'item-1',
              serialNumber: 'SN-2',
              assetTag: null,
              currentStatus: SerializedAssetStatus.AVAILABLE,
              usefulLifeMonths: 36,
              purchaseDate: '2025-01-01',
              warrantyUntil: null,
              updatedAt: new Date(),
            },
          ];
        }

        return [{ id: 'item-1', sku: 'SKU-1', name: 'ONT' }];
      }),
    };

    runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) =>
      work({ manager } as never),
    );

    const service = buildService(manager);
    const result = await service.listUsefulLifeAlerts({ page: 1, pageSize: 20 });

    expect(result.total).toBe(2);
    expect(result.data.map((row) => row.id).sort()).toEqual(['asset-por-vencer', 'asset-vencida']);

    jest.useRealTimers();
  });
});
