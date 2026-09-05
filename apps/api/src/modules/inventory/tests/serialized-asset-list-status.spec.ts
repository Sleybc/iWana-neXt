import { DataSource } from 'typeorm';
import { SerializedAssetStatus } from '@iwana/shared';
import { SerializedAssetService } from '../services/serialized-asset.service';
import { AssetLifecycleService } from '../services/asset-lifecycle.service';
import { AssetLoanService } from '../services/asset-loan.service';
import { SupplierPartyPort } from '../ports/supplier-party.port';
import { StockMovementQueryService } from '../services/stock-movement-query.service';
import { ListSerializedAssetsQuerySchema } from '../dto';

jest.mock('@iwana/db', () => ({
  SerializedAsset: class SerializedAsset {},
  InventoryItem: class InventoryItem {},
  InventoryCategory: class InventoryCategory {},
  StockLocation: class StockLocation {},
  PurchaseOrder: class PurchaseOrder {},
  GoodsReceipt: class GoodsReceipt {},
  StockMovement: class StockMovement {},
  StockMovementLine: class StockMovementLine {},
  SupplierProfile: class SupplierProfile {},
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({ tenantId: 'tenant-001', schemaName: 'tenant_001' }),
  },
  runInTenantSchema: jest.fn(),
}));

const iwanaDb = require('@iwana/db') as {
  TenantContext: { getOrThrow: jest.Mock };
  runInTenantSchema: jest.Mock;
};

describe('ListSerializedAssets status múltiple (MOD12 S1 · B2)', () => {
  describe('schema', () => {
    it('acepta un valor único y lo normaliza a lista', () => {
      const parsed = ListSerializedAssetsQuerySchema.parse({ status: 'AVAILABLE' });

      expect(parsed.status).toEqual([SerializedAssetStatus.AVAILABLE]);
    });

    it('acepta lista separada por comas con espacios', () => {
      const parsed = ListSerializedAssetsQuerySchema.parse({
        status: 'AVAILABLE, AVAILABLE_REFURBISHED',
      });

      expect(parsed.status).toEqual([
        SerializedAssetStatus.AVAILABLE,
        SerializedAssetStatus.AVAILABLE_REFURBISHED,
      ]);
    });

    it('omite el filtro cuando status es vacío', () => {
      const parsed = ListSerializedAssetsQuerySchema.parse({ status: '' });

      expect(parsed.status).toBeUndefined();
    });

    it('rechaza tokens inválidos (el pipe lo convierte en 400 en español)', () => {
      const result = ListSerializedAssetsQuerySchema.safeParse({ status: 'AVAILABLE,NO_EXISTE' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(JSON.stringify(result.error.flatten())).toContain('no es válido');
      }
    });
  });

  describe('servicio', () => {
    let manager: any;
    const andWhereCalls: Array<{ sql: string; params: Record<string, unknown> }> = [];

    function createService() {
      const qb: any = {};
      qb.where = jest.fn().mockReturnValue(qb);
      qb.andWhere = jest
        .fn()
        .mockImplementation((sql: string, params?: Record<string, unknown>) => {
          andWhereCalls.push({ sql, params: params ?? {} });
          return qb;
        });
      qb.orderBy = jest.fn().mockReturnValue(qb);
      qb.addOrderBy = jest.fn().mockReturnValue(qb);
      qb.skip = jest.fn().mockReturnValue(qb);
      qb.take = jest.fn().mockReturnValue(qb);
      qb.clone = jest.fn().mockReturnValue(qb);
      qb.getCount = jest.fn().mockResolvedValue(0);
      qb.getMany = jest.fn().mockResolvedValue([]);
      manager = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
      iwanaDb.runInTenantSchema.mockImplementation(
        async (_ds: unknown, _schema: string, cb: (qr: { manager: unknown }) => unknown) =>
          cb({ manager }),
      );

      return new SerializedAssetService(
        {} as DataSource,
        {} as AssetLifecycleService,
        {} as StockMovementQueryService,
        {} as SupplierPartyPort,
        {} as AssetLoanService,
      );
    }

    beforeEach(() => {
      jest.clearAllMocks();
      andWhereCalls.length = 0;
      iwanaDb.TenantContext.getOrThrow.mockReturnValue({
        tenantId: 'tenant-001',
        schemaName: 'tenant_001',
      });
    });

    it('filtra con IN sobre la lista de estados', async () => {
      const service = createService();

      await service.list({ status: 'AVAILABLE,AVAILABLE_REFURBISHED' });

      const statusCall = andWhereCalls.find((call) => call.sql.includes('current_status IN'));
      expect(statusCall?.params['statuses']).toEqual([
        SerializedAssetStatus.AVAILABLE,
        SerializedAssetStatus.AVAILABLE_REFURBISHED,
      ]);
    });

    it('mantiene compatible el valor único como IN de un elemento', async () => {
      const service = createService();

      await service.list({ status: 'AVAILABLE' });

      const statusCall = andWhereCalls.find((call) => call.sql.includes('current_status IN'));
      expect(statusCall?.params['statuses']).toEqual([SerializedAssetStatus.AVAILABLE]);
    });

    it('sin status no filtra por estado', async () => {
      const service = createService();

      await service.list({});

      expect(andWhereCalls.some((call) => call.sql.includes('current_status'))).toBe(false);
    });
  });
});
