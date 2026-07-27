import { DataSource } from 'typeorm';
import { SerializedAssetStatus } from '@iwana/shared';
import { SerializedAssetService } from '../services/serialized-asset.service';
import { USEFUL_LIFE_ALERT_THRESHOLD_MONTHS } from '../services/serialized-asset-useful-life.util';

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

type AlertAsset = {
  id: string;
  inventoryItemId: string;
  serialNumber: string | null;
  assetTag: string | null;
  currentStatus: SerializedAssetStatus;
  usefulLifeMonths: number | null;
  purchaseDate: string | null;
  warrantyUntil: string | null;
  updatedAt: Date;
};

describe('SerializedAssetService.listUsefulLifeAlerts', () => {
  const runInTenantSchemaMock = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;
  const reference = new Date('2026-07-21T00:00:00.000Z');

  function buildService(): SerializedAssetService {
    return new SerializedAssetService(
      {} as DataSource,
      { listPaginatedForAsset: jest.fn() } as never,
      { list: jest.fn() } as never,
      { getSupplierSummariesBatch: jest.fn() } as never,
      { listForAsset: jest.fn() } as never,
    );
  }

  function buildQueryBuilder(pageAssets: AlertAsset[], total: number) {
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(total),
      getMany: jest.fn().mockResolvedValue(pageAssets),
    };
    return qb;
  }

  function buildManager(pageAssets: AlertAsset[], total: number) {
    const qb = buildQueryBuilder(pageAssets, total);
    const find = jest.fn().mockResolvedValue([{ id: 'item-1', sku: 'SKU-1', name: 'ONT' }]);
    return {
      manager: {
        createQueryBuilder: jest.fn().mockReturnValue(qb),
        find,
      },
      qb,
      find,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (TenantContext.getOrThrow as jest.Mock).mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    });
    jest.useFakeTimers().setSystemTime(reference);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('filtra por-vencer vía SQL y resuelve ítems solo de la página', async () => {
    const pageAssets: AlertAsset[] = [
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
    ];
    const { manager, qb, find } = buildManager(pageAssets, 1);
    runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) =>
      work({ manager } as never),
    );

    const result = await buildService().listUsefulLifeAlerts({
      status: 'por-vencer',
      page: 1,
      pageSize: 20,
    });

    expect(qb.getCount).toHaveBeenCalled();
    expect(qb.skip).toHaveBeenCalledWith(0);
    expect(qb.take).toHaveBeenCalledWith(20);
    // DEF-1: orden estable (updated_at + desempate por id).
    expect(qb.orderBy).toHaveBeenCalledWith('asset.updated_at', 'DESC');
    expect(qb.addOrderBy).toHaveBeenCalledWith('asset.id', 'DESC');
    expect(qb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining("INTERVAL '1 month'"),
      expect.any(Object),
    );
    expect(find).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-001',
          id: expect.anything(),
        }),
      }),
    );
    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.id).toBe('asset-por-vencer');
    expect(result.data[0]?.status).toBe('por-vencer');
    expect(result.data[0]?.sku).toBe('SKU-1');
    expect(result.limit).toBe(20);
  });

  it('filtra vencida vía SQL', async () => {
    const pageAssets: AlertAsset[] = [
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
    const { manager } = buildManager(pageAssets, 1);
    runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) =>
      work({ manager } as never),
    );

    const result = await buildService().listUsefulLifeAlerts({
      status: 'vencida',
      page: 1,
      pageSize: 10,
    });

    expect(result.total).toBe(1);
    expect(result.data[0]?.status).toBe('vencida');
  });

  it('excluye estados terminales WRITTEN_OFF, LOST y SOLD (CA-H6-04)', async () => {
    const { manager, qb } = buildManager([], 0);
    runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) =>
      work({ manager } as never),
    );

    await buildService().listUsefulLifeAlerts({ page: 1, pageSize: 20 });

    expect(qb.andWhere).toHaveBeenCalledWith('asset.current_status NOT IN (:...terminalStatuses)', {
      terminalStatuses: [
        SerializedAssetStatus.WRITTEN_OFF,
        SerializedAssetStatus.LOST,
        SerializedAssetStatus.SOLD,
      ],
    });
  });

  it('obtiene total de COUNT y acota la página en SQL (CA-H6-05)', async () => {
    const pageAssets: AlertAsset[] = Array.from({ length: 5 }, (_, index) => ({
      id: `asset-${index}`,
      inventoryItemId: 'item-1',
      serialNumber: `SN-${index}`,
      assetTag: null,
      currentStatus: SerializedAssetStatus.AVAILABLE,
      usefulLifeMonths: 6,
      purchaseDate: '2025-01-01',
      warrantyUntil: null,
      updatedAt: new Date(2026, 6, 21 - index),
    }));
    const { manager, qb, find } = buildManager(pageAssets, 47);
    runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) =>
      work({ manager } as never),
    );

    const result = await buildService().listUsefulLifeAlerts({ page: 2, pageSize: 5 });

    expect(qb.getCount).toHaveBeenCalledTimes(1);
    expect(qb.skip).toHaveBeenCalledWith(5);
    expect(qb.take).toHaveBeenCalledWith(5);
    expect(result.total).toBe(47);
    expect(result.data).toHaveLength(5);
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(5);
    expect(result.limit).toBe(5);
    // Solo resuelve ítems de la página (no del universo N=47).
    expect(find).toHaveBeenCalledTimes(1);
  });

  it('conserva umbral SQL de 3 meses (CA-H6-06 vive en EV-1 contra Postgres)', () => {
    expect(USEFUL_LIFE_ALERT_THRESHOLD_MONTHS).toBe(3);
  });
});
