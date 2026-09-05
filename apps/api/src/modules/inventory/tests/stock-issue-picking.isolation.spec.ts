import { DataSource } from 'typeorm';
import { InventoryTrackingMode, StockBalanceCondition } from '@iwana/shared';
import { StockIssuePickingService } from '../services/stock-issue-picking.service';

jest.mock('@iwana/db', () => ({
  InventoryCategory: class InventoryCategory {},
  InventoryItem: class InventoryItem {},
  SerializedAsset: class SerializedAsset {},
  StockBalance: class StockBalance {},
  StockLot: class StockLot {},
  TenantContext: {
    getOrThrow: jest.fn(),
  },
  runInTenantSchema: jest.fn(),
}));

const iwanaDb = require('@iwana/db') as {
  TenantContext: { getOrThrow: jest.Mock };
  runInTenantSchema: jest.Mock;
  InventoryCategory: { name: string };
  InventoryItem: { name: string };
  SerializedAsset: { name: string };
  StockBalance: { name: string };
  StockLot: { name: string };
};

const LOCATION_ID = '11111111-1111-4111-8111-111111111111';

interface TenantSeed {
  tenantId: string;
  itemId: string;
  itemName: string;
  sku: string;
  sumOnHand: string;
  sumReserved: string;
}

const SEED_A: TenantSeed = {
  tenantId: 'tenant-a-id',
  itemId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  itemName: 'Cable drop A',
  sku: 'CBL-A-001',
  sumOnHand: '10.00',
  sumReserved: '2.00',
};

const SEED_B: TenantSeed = {
  tenantId: 'tenant-b-id',
  itemId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  itemName: 'Router B',
  sku: 'RTR-B-001',
  sumOnHand: '5.00',
  sumReserved: '0.00',
};

const schemaCalls: string[] = [];
const tenantParamsSeen: unknown[] = [];
let currentTenant = { tenantId: SEED_A.tenantId, schemaName: 'tenant_a' };

function managerForSeed(seed: TenantSeed) {
  const manager: any = {
    find: jest.fn().mockImplementation(async (entity: any, options?: any) => {
      tenantParamsSeen.push(options?.where?.tenantId);
      if (entity === iwanaDb.InventoryItem) {
        return [
          {
            id: seed.itemId,
            sku: seed.sku,
            name: seed.itemName,
            categoryId: null,
            trackingMode: InventoryTrackingMode.CONSUMABLE,
            unitOfMeasure: 'UNIT',
            assetControlled: false,
          },
        ];
      }
      return [];
    }),
    createQueryBuilder: jest.fn().mockImplementation(() => {
      const selects: string[] = [];
      const qb: any = {};
      qb.select = jest.fn().mockImplementation((...args: unknown[]) => {
        selects.push(String(args[1] ?? args[0]));
        return qb;
      });
      qb.addSelect = jest.fn().mockImplementation((...args: unknown[]) => {
        selects.push(String(args[1] ?? args[0]));
        return qb;
      });
      qb.innerJoin = jest.fn().mockReturnValue(qb);
      qb.where = jest.fn().mockImplementation((_sql: string, params?: Record<string, unknown>) => {
        tenantParamsSeen.push(params?.['tenantId']);
        return qb;
      });
      qb.andWhere = jest
        .fn()
        .mockImplementation((_sql: string, params?: Record<string, unknown>) => {
          tenantParamsSeen.push(params?.['tenantId']);
          return qb;
        });
      qb.groupBy = jest.fn().mockReturnValue(qb);
      qb.addGroupBy = jest.fn().mockReturnValue(qb);
      qb.orderBy = jest.fn().mockReturnValue(qb);
      qb.addOrderBy = jest.fn().mockReturnValue(qb);
      qb.skip = jest.fn().mockReturnValue(qb);
      qb.take = jest.fn().mockReturnValue(qb);
      qb.clone = jest.fn().mockReturnValue(qb);
      qb.getRawMany = jest.fn().mockImplementation(async () => {
        if (selects.includes('itemName')) {
          return [
            {
              itemId: seed.itemId,
              itemName: seed.itemName,
              sumOnHand: seed.sumOnHand,
              sumReserved: seed.sumReserved,
            },
          ];
        }
        if (selects.includes('condition')) {
          return [
            {
              itemId: seed.itemId,
              condition: StockBalanceCondition.NEW,
              sumOnHand: seed.sumOnHand,
              sumReserved: seed.sumReserved,
            },
          ];
        }
        return [];
      });
      return qb;
    }),
  };
  return manager;
}

describe('StockIssuePickingService aislamiento multi-tenant (CA-S1-08)', () => {
  let service: StockIssuePickingService;

  beforeAll(() => {
    iwanaDb.TenantContext.getOrThrow.mockImplementation(() => currentTenant);
    iwanaDb.runInTenantSchema.mockImplementation(
      async (_ds: unknown, schemaName: string, cb: (qr: { manager: unknown }) => unknown) => {
        schemaCalls.push(schemaName);
        const seed = schemaName === 'tenant_b' ? SEED_B : SEED_A;
        return cb({ manager: managerForSeed(seed) });
      },
    );
    service = new StockIssuePickingService({} as DataSource);
  });

  beforeEach(() => {
    schemaCalls.length = 0;
    tenantParamsSeen.length = 0;
    currentTenant = { tenantId: SEED_A.tenantId, schemaName: 'tenant_a' };
  });

  it('el tenant A solo ve su material con su disponible', async () => {
    const result = await service.listPickableItems({ sourceLocationId: LOCATION_ID });

    expect(result.meta.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        itemId: SEED_A.itemId,
        sku: SEED_A.sku,
        totalAvailable: '8.00',
      }),
    );
    expect(JSON.stringify(result.data)).not.toContain(SEED_B.itemId);
    expect(schemaCalls).toEqual(['tenant_a']);
  });

  it('el tenant B solo ve su material y no el del tenant A', async () => {
    currentTenant = { tenantId: SEED_B.tenantId, schemaName: 'tenant_b' };

    const result = await service.listPickableItems({ sourceLocationId: LOCATION_ID });

    expect(result.meta.total).toBe(1);
    expect(result.data[0]).toEqual(
      expect.objectContaining({ itemId: SEED_B.itemId, totalAvailable: '5.00' }),
    );
    expect(JSON.stringify(result.data)).not.toContain(SEED_A.itemId);
    expect(schemaCalls).toEqual(['tenant_b']);
  });

  it('toda consulta del listado filtra por el tenant autenticado', async () => {
    await service.listPickableItems({ sourceLocationId: LOCATION_ID });

    expect(tenantParamsSeen.length).toBeGreaterThan(0);
    for (const tenantId of tenantParamsSeen) {
      expect(tenantId === undefined || tenantId === SEED_A.tenantId).toBe(true);
    }
    expect(tenantParamsSeen).toContain(SEED_A.tenantId);
  });
});
