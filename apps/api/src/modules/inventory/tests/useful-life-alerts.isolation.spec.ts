import { DataSource } from 'typeorm';
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
};

/**
 * Aislamiento de alertas de vida útil (H6-R1 / CA multi-tenant).
 * No filtra filas por tenant en el stub: demuestra que el servicio emite
 * `asset.tenant_id = :tenantId` en el predicado del QueryBuilder.
 */
describe('useful-life-alerts aislamiento tenant', () => {
  let currentTenant = { tenantId: 'tenant-a', schemaName: 'tenant_a' };
  let lastQb: {
    where: jest.Mock;
    andWhere: jest.Mock;
    orderBy: jest.Mock;
    skip: jest.Mock;
    take: jest.Mock;
    getCount: jest.Mock;
    getMany: jest.Mock;
  };

  function managerStub() {
    lastQb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
      getMany: jest.fn().mockResolvedValue([]),
    };
    return {
      createQueryBuilder: jest.fn().mockReturnValue(lastQb),
      find: jest.fn().mockResolvedValue([]),
    };
  }

  let service: SerializedAssetService;

  beforeAll(() => {
    iwanaDb.TenantContext.getOrThrow.mockImplementation(() => currentTenant);
    iwanaDb.runInTenantSchema.mockImplementation(
      async (_ds: unknown, schemaName: string, cb: (qr: { manager: unknown }) => unknown) => {
        expect(schemaName).toBe(currentTenant.schemaName);
        return cb({ manager: managerStub() });
      },
    );

    service = new SerializedAssetService(
      {} as DataSource,
      { listPaginatedForAsset: jest.fn() } as never,
      { list: jest.fn() } as never,
      { getSupplierSummariesBatch: jest.fn() } as never,
      { listForAsset: jest.fn() } as never,
    );

    jest.useFakeTimers().setSystemTime(new Date('2026-07-21T00:00:00.000Z'));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('emite predicado tenant_id = :tenantId y corre en el schema del contexto', async () => {
    currentTenant = { tenantId: 'tenant-a', schemaName: 'tenant_a' };
    await service.listUsefulLifeAlerts({
      status: 'vencida',
      page: 1,
      pageSize: 20,
    });

    expect(lastQb.where).toHaveBeenCalledWith('asset.tenant_id = :tenantId', {
      tenantId: 'tenant-a',
    });
    expect(iwanaDb.runInTenantSchema).toHaveBeenCalledWith(
      expect.anything(),
      'tenant_a',
      expect.any(Function),
    );

    currentTenant = { tenantId: 'tenant-b', schemaName: 'tenant_b' };
    await service.listUsefulLifeAlerts({
      status: 'por-vencer',
      page: 1,
      pageSize: 20,
    });

    expect(lastQb.where).toHaveBeenCalledWith('asset.tenant_id = :tenantId', {
      tenantId: 'tenant-b',
    });
    expect(iwanaDb.runInTenantSchema).toHaveBeenCalledWith(
      expect.anything(),
      'tenant_b',
      expect.any(Function),
    );

    // El stub no filtra por tenant: la evidencia es el predicado emitido + schema.
    expect(lastQb.getMany).toHaveBeenCalled();
  });
});
