import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InventoryTrackingMode, SerializedAssetStatus, StockBalanceCondition } from '@iwana/shared';
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

const TENANT_ID = 'tenant-a-id';
const SCHEMA = 'tenant_a';
const LOCATION_ID = '11111111-1111-4111-8111-111111111111';

const ITEM_CONSUMABLE = '22222222-2222-4222-8222-222222222222';
const ITEM_SERIALIZED = '33333333-3333-4333-8333-333333333333';
const ITEM_EMPTY = '44444444-4444-4333-8333-444444444444';
const CATEGORY_ID = '55555555-5555-4555-8555-555555555555';
const LOT_ID = '66666666-6666-4666-8666-666666666666';

interface PickingSeed {
  aggregates: Array<{ itemId: string; itemName: string; sumOnHand: string; sumReserved: string }>;
  items: Array<Record<string, unknown>>;
  categories: Array<Record<string, unknown>>;
  conditionRows: Array<Record<string, unknown>>;
  lotRows: Array<Record<string, unknown>>;
  serialRows: Array<{ itemId: string; serialCount: string }>;
  lots: Array<Record<string, unknown>>;
  catalogPage?: Array<Record<string, unknown>>;
  catalogTotal?: number;
}

function buildSeed(overrides: Partial<PickingSeed> = {}): PickingSeed {
  return {
    aggregates: [
      {
        itemId: ITEM_CONSUMABLE,
        itemName: 'Cable drop',
        sumOnHand: '10.00',
        sumReserved: '2.00',
      },
      {
        itemId: ITEM_SERIALIZED,
        itemName: 'Router Onu Gpon',
        sumOnHand: '5.00',
        sumReserved: '0.00',
      },
    ],
    items: [
      {
        id: ITEM_CONSUMABLE,
        sku: 'CBL-DRP-001',
        name: 'Cable drop',
        categoryId: CATEGORY_ID,
        trackingMode: InventoryTrackingMode.CONSUMABLE,
        unitOfMeasure: 'METER',
        assetControlled: false,
      },
      {
        id: ITEM_SERIALIZED,
        sku: 'CFO-SER-ROGPN-TPL-XC220',
        name: 'Router Onu Gpon',
        categoryId: CATEGORY_ID,
        trackingMode: InventoryTrackingMode.SERIALIZED,
        unitOfMeasure: 'UNIT',
        assetControlled: true,
      },
    ],
    categories: [{ id: CATEGORY_ID, name: 'Fibra óptica' }],
    conditionRows: [
      {
        itemId: ITEM_CONSUMABLE,
        condition: StockBalanceCondition.NEW,
        sumOnHand: '7.00',
        sumReserved: '2.00',
      },
      {
        itemId: ITEM_CONSUMABLE,
        condition: StockBalanceCondition.REFURBISHED,
        sumOnHand: '3.00',
        sumReserved: '0.00',
      },
      {
        itemId: ITEM_SERIALIZED,
        condition: StockBalanceCondition.NEW,
        sumOnHand: '5.00',
        sumReserved: '0.00',
      },
    ],
    lotRows: [
      {
        itemId: ITEM_CONSUMABLE,
        lotId: LOT_ID,
        condition: StockBalanceCondition.NEW,
        sumOnHand: '7.00',
        sumReserved: '2.00',
      },
    ],
    serialRows: [{ itemId: ITEM_SERIALIZED, serialCount: '2' }],
    lots: [{ id: LOT_ID, lotNumber: 'LOTE-045', expiryDate: '2027-03-31' }],
    ...overrides,
  };
}

interface RecordedWhere {
  sql: string;
  params: Record<string, unknown>;
}

/**
 * Manager falso que enruta `getRawMany` por los alias seleccionados:
 * `itemName` → agregado por ítem, `lotId` → lotes, `condition` → condiciones,
 * `serialCount` → conteo de seriales. Registra wheres para auditar tenancy.
 */
function buildManager(seed: PickingSeed) {
  const whereCalls: RecordedWhere[] = [];
  const joinCalls: string[] = [];
  const findWheres: Array<{ entity: string; where: unknown }> = [];
  const createdQbs: Array<Record<string, jest.Mock>> = [];

  const manager: any = {
    find: jest
      .fn()
      .mockImplementation(
        async (entity: { name: string }, options?: { where?: { id?: unknown } }) => {
          findWheres.push({ entity: entity?.name ?? '?', where: options?.where });
          if (entity === iwanaDb.InventoryItem) {
            return seed.items;
          }
          if (entity === iwanaDb.InventoryCategory) {
            return seed.categories;
          }
          if (entity === iwanaDb.StockLot) {
            return seed.lots;
          }
          return [];
        },
      ),
    createQueryBuilder: jest.fn().mockImplementation(() => {
      const selects: string[] = [];
      // S2.1 · B2: el fake emula el HAVING y la paginación SQL (filtra,
      // ordena por disponible y aplica offset/limit) como lo haría PostgreSQL.
      let offsetVal = 0;
      let limitVal = Number.MAX_SAFE_INTEGER;
      const qb: any = {};
      qb.select = jest.fn().mockImplementation((...args: unknown[]) => {
        selects.push(String(args[1] ?? args[0]));
        return qb;
      });
      qb.addSelect = jest.fn().mockImplementation((...args: unknown[]) => {
        selects.push(String(args[1] ?? args[0]));
        return qb;
      });
      qb.innerJoin = jest.fn().mockImplementation((...args: unknown[]) => {
        joinCalls.push(args.map((arg) => String(arg)).join(' '));
        return qb;
      });
      qb.where = jest.fn().mockImplementation((sql: string, params?: Record<string, unknown>) => {
        whereCalls.push({ sql, params: params ?? {} });
        return qb;
      });
      qb.andWhere = jest
        .fn()
        .mockImplementation((sql: string, params?: Record<string, unknown>) => {
          whereCalls.push({ sql, params: params ?? {} });
          return qb;
        });
      qb.groupBy = jest.fn().mockReturnValue(qb);
      qb.addGroupBy = jest.fn().mockReturnValue(qb);
      qb.having = jest.fn().mockReturnValue(qb);
      qb.orderBy = jest.fn().mockReturnValue(qb);
      qb.addOrderBy = jest.fn().mockReturnValue(qb);
      qb.offset = jest.fn().mockImplementation((value: number) => {
        offsetVal = value;
        return qb;
      });
      qb.limit = jest.fn().mockImplementation((value: number) => {
        limitVal = value;
        return qb;
      });
      qb.from = jest.fn().mockImplementation((target: unknown, alias?: unknown) => {
        if (alias === undefined && typeof target === 'function') {
          (target as (inner: unknown) => void)(qb);
        }
        return qb;
      });
      qb.setParameters = jest.fn().mockReturnValue(qb);
      qb.skip = jest.fn().mockReturnValue(qb);
      qb.take = jest.fn().mockReturnValue(qb);
      qb.clone = jest.fn().mockReturnValue(qb);
      qb.getCount = jest.fn().mockResolvedValue(seed.catalogTotal ?? seed.items.length);
      qb.getMany = jest.fn().mockResolvedValue(seed.catalogPage ?? []);
      qb.getRawOne = jest.fn().mockImplementation(async () => {
        if (selects.includes('total')) {
          const positives = seed.aggregates.filter(
            (row) => Number(row.sumOnHand) - Number(row.sumReserved) > 0,
          );
          return { total: String(positives.length) };
        }
        return null;
      });
      qb.getRawMany = jest.fn().mockImplementation(async () => {
        if (selects.includes('itemName')) {
          return seed.aggregates
            .filter((row) => Number(row.sumOnHand) - Number(row.sumReserved) > 0)
            .sort((a, b) => {
              const totalA = Number(a.sumOnHand) - Number(a.sumReserved);
              const totalB = Number(b.sumOnHand) - Number(b.sumReserved);
              if (totalB !== totalA) {
                return totalB - totalA;
              }
              if (a.itemName !== b.itemName) {
                return a.itemName < b.itemName ? -1 : 1;
              }
              if (a.itemId !== b.itemId) {
                return a.itemId < b.itemId ? -1 : 1;
              }
              return 0;
            })
            .slice(offsetVal, offsetVal + limitVal);
        }
        if (selects.includes('lotId')) {
          return seed.lotRows;
        }
        if (selects.includes('condition')) {
          return seed.conditionRows;
        }
        if (selects.includes('serialCount')) {
          return seed.serialRows;
        }
        return [];
      });
      createdQbs.push(qb);
      return qb;
    }),
  };

  return { manager, whereCalls, joinCalls, findWheres, createdQbs };
}

describe('StockIssuePickingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    iwanaDb.TenantContext.getOrThrow.mockReturnValue({ tenantId: TENANT_ID, schemaName: SCHEMA });
    iwanaDb.runInTenantSchema.mockImplementation(
      async (_ds: unknown, schemaName: string, cb: (qr: { manager: unknown }) => unknown) => {
        expect(schemaName).toBe(SCHEMA);
        return cb({ manager: buildManager(buildSeed()).manager });
      },
    );
  });

  function createServiceWithSeed(seed: PickingSeed) {
    const { manager, whereCalls, joinCalls, findWheres, createdQbs } = buildManager(seed);
    iwanaDb.runInTenantSchema.mockImplementation(
      async (_ds: unknown, _schema: string, cb: (qr: { manager: unknown }) => unknown) =>
        cb({ manager }),
    );
    return {
      service: new StockIssuePickingService({} as DataSource),
      whereCalls,
      joinCalls,
      findWheres,
      createdQbs,
    };
  }

  it('CA-S1-01: sin q devuelve los ítems con disponible > 0 y meta.total correcto', async () => {
    const seed = buildSeed({
      aggregates: [
        ...buildSeed().aggregates,
        { itemId: ITEM_EMPTY, itemName: 'Tornillo', sumOnHand: '4.00', sumReserved: '4.00' },
      ],
    });
    const { service } = createServiceWithSeed(seed);

    const result = await service.listPickableItems({ sourceLocationId: LOCATION_ID });

    expect(result.meta.total).toBe(2);
    expect(result.data.map((row) => row.itemId).sort()).toEqual(
      [ITEM_CONSUMABLE, ITEM_SERIALIZED].sort(),
    );
  });

  it('usa limit 25 por defecto y modo page (CA-S1-01)', async () => {
    const { service } = createServiceWithSeed(buildSeed());

    const result = await service.listPickableItems({ sourceLocationId: LOCATION_ID });

    expect(result.meta.limit).toBe(25);
    expect(result.meta.mode).toBe('page');
    expect(result.meta.page).toBe(1);
  });

  it('CA-S1-02: cada fila trae sku, nombre, categoría, unidad, tracking y disponible reales', async () => {
    const { service } = createServiceWithSeed(buildSeed());

    const result = await service.listPickableItems({ sourceLocationId: LOCATION_ID });
    const consumable = result.data.find((row) => row.itemId === ITEM_CONSUMABLE);

    expect(consumable).toEqual(
      expect.objectContaining({
        sku: 'CBL-DRP-001',
        name: 'Cable drop',
        categoryId: CATEGORY_ID,
        categoryName: 'Fibra óptica',
        unitOfMeasure: 'METER',
        trackingMode: InventoryTrackingMode.CONSUMABLE,
        assetControlled: false,
        totalAvailable: '8.00',
        availableSerialCount: 0,
      }),
    );
    const serialized = result.data.find((row) => row.itemId === ITEM_SERIALIZED);
    expect(serialized).toEqual(
      expect.objectContaining({
        sku: 'CFO-SER-ROGPN-TPL-XC220',
        trackingMode: InventoryTrackingMode.SERIALIZED,
        assetControlled: true,
        totalAvailable: '5.00',
        availableSerialCount: 2,
      }),
    );
  });

  it('CA-S1-03: availability desglosa NEW y REFURBISHED con saldo propio', async () => {
    const { service } = createServiceWithSeed(buildSeed());

    const result = await service.listPickableItems({ sourceLocationId: LOCATION_ID });
    const consumable = result.data.find((row) => row.itemId === ITEM_CONSUMABLE);

    expect(consumable?.availability).toEqual([
      {
        condition: StockBalanceCondition.NEW,
        quantityOnHand: '7.00',
        quantityReserved: '2.00',
        available: '5.00',
      },
      {
        condition: StockBalanceCondition.REFURBISHED,
        quantityOnHand: '3.00',
        quantityReserved: '0.00',
        available: '3.00',
      },
    ]);
  });

  it('CA-S1-07: lots trae lotNumber y vencimiento reales y excluye lotes sin disponible', async () => {
    const seed = buildSeed({
      lotRows: [
        ...buildSeed().lotRows,
        {
          itemId: ITEM_CONSUMABLE,
          lotId: '77777777-7777-4777-8777-777777777777',
          condition: StockBalanceCondition.DAMAGED,
          sumOnHand: '1.00',
          sumReserved: '1.00',
        },
      ],
      lots: [
        ...buildSeed().lots,
        { id: '77777777-7777-4777-8777-777777777777', lotNumber: 'LOTE-046', expiryDate: null },
      ],
    });
    const { service } = createServiceWithSeed(seed);

    const result = await service.listPickableItems({ sourceLocationId: LOCATION_ID });
    const consumable = result.data.find((row) => row.itemId === ITEM_CONSUMABLE);

    expect(consumable?.lots).toEqual([
      {
        lotId: LOT_ID,
        lotNumber: 'LOTE-045',
        expiryDate: '2027-03-31',
        condition: StockBalanceCondition.NEW,
        available: '5.00',
      },
    ]);
  });

  it('ordena por totalAvailable DESC y pagina ítems agregados, no balances', async () => {
    const seed = buildSeed();
    const { service } = createServiceWithSeed(seed);

    const first = await service.listPickableItems({
      sourceLocationId: LOCATION_ID,
      page: 1,
      limit: 1,
    });
    const second = await service.listPickableItems({
      sourceLocationId: LOCATION_ID,
      page: 2,
      limit: 1,
    });

    expect(first.meta.total).toBe(2);
    expect(first.data).toHaveLength(1);
    expect(first.data[0]?.itemId).toBe(ITEM_CONSUMABLE);
    expect(first.data[0]?.totalAvailable).toBe('8.00');
    expect(second.data).toHaveLength(1);
    expect(second.data[0]?.itemId).toBe(ITEM_SERIALIZED);
  });

  it('S2.1 · B2: with-stock filtra con HAVING y pagina en SQL (total + ventana)', async () => {
    const { service, createdQbs } = createServiceWithSeed(buildSeed());

    const result = await service.listPickableItems({
      sourceLocationId: LOCATION_ID,
      page: 1,
      limit: 1,
    });

    // El filtro disponible > 0 viaja en el HAVING, no en TS.
    const havingCalls = createdQbs.flatMap((qb) =>
      (qb['having'] as jest.Mock).mock.calls.map((call) => String(call[0])),
    );
    expect(havingCalls.some((sql) => sql.includes('quantity_on_hand') && sql.includes('> 0'))).toBe(
      true,
    );
    // La ventana de la página viaja en OFFSET/LIMIT con orden por disponible.
    const pageQb = createdQbs.find((qb) =>
      (qb['offset'] as jest.Mock).mock.calls.some((call) => call[0] === 0),
    );
    expect(pageQb).toBeDefined();
    expect((pageQb?.['limit'] as jest.Mock).mock.calls).toContainEqual([1]);
    expect((pageQb?.['orderBy'] as jest.Mock).mock.calls).toContainEqual([
      'SUM(balance.quantity_on_hand::numeric) - SUM(balance.quantity_reserved::numeric)',
      'DESC',
    ]);
    // El total cuenta en SQL los grupos que pasan el HAVING (sin el ítem en cero).
    expect(result.meta.total).toBe(2);
  });

  it('scope=catalog devuelve el catálogo con totalAvailable 0 cuando no hay saldo', async () => {
    const seed = buildSeed({
      items: [
        ...buildSeed().items,
        {
          id: ITEM_EMPTY,
          sku: 'TRN-001',
          name: 'Tornillo',
          categoryId: CATEGORY_ID,
          trackingMode: InventoryTrackingMode.CONSUMABLE,
          unitOfMeasure: 'UNIT',
          assetControlled: false,
        },
      ],
      catalogPage: [
        {
          id: ITEM_EMPTY,
          sku: 'TRN-001',
          name: 'Tornillo',
          categoryId: CATEGORY_ID,
          trackingMode: InventoryTrackingMode.CONSUMABLE,
          unitOfMeasure: 'UNIT',
          assetControlled: false,
        },
      ],
      catalogTotal: 3,
      conditionRows: buildSeed().conditionRows,
      lotRows: [],
      serialRows: [],
    });
    const { service } = createServiceWithSeed(seed);

    const result = await service.listPickableItems({
      sourceLocationId: LOCATION_ID,
      scope: 'catalog',
    });

    expect(result.meta.total).toBe(3);
    const empty = result.data.find((row) => row.itemId === ITEM_EMPTY);
    expect(empty).toEqual(
      expect.objectContaining({
        totalAvailable: '0.00',
        availability: [],
        lots: [],
        availableSerialCount: 0,
      }),
    );
  });

  it('filtra server-side por q con escape LIKE y cuenta seriales solo AVAILABLE/REFURBISHED', async () => {
    const { service, whereCalls } = createServiceWithSeed(buildSeed());

    await service.listPickableItems({ sourceLocationId: LOCATION_ID, q: 'Onu 100%_x' });

    const likeCall = whereCalls.find((call) => 'pickingLike' in call.params);
    expect(likeCall?.params['pickingLike']).toBe('%onu 100\\%\\_x%');
    const serialCall = whereCalls.find((call) => 'pickingSerialStatuses' in call.params);
    expect(serialCall?.params['pickingSerialStatuses']).toEqual([
      SerializedAssetStatus.AVAILABLE,
      SerializedAssetStatus.AVAILABLE_REFURBISHED,
    ]);
  });

  it('rechaza cursor con 400 en español y page+cursor excluyentes', async () => {
    const { service } = createServiceWithSeed(buildSeed());

    await expect(
      service.listPickableItems({ sourceLocationId: LOCATION_ID, cursor: 'abc' }),
    ).rejects.toThrow('no admite cursor');
    await expect(
      service.listPickableItems({ sourceLocationId: LOCATION_ID, page: 1, cursor: 'abc' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('filtra por tenant_id en cada tabla del join (CA-S1-08 parcial BE)', async () => {
    const { service, whereCalls, joinCalls, findWheres } = createServiceWithSeed(buildSeed());

    await service.listPickableItems({ sourceLocationId: LOCATION_ID });

    const balanceWheres = whereCalls.filter((call) => call.sql.includes('balance.tenant_id'));
    expect(balanceWheres.length).toBeGreaterThan(0);
    for (const call of balanceWheres) {
      expect(call.params['tenantId']).toBe(TENANT_ID);
    }
    const assetWheres = whereCalls.filter((call) => call.sql.includes('asset.tenant_id'));
    expect(assetWheres.length).toBeGreaterThan(0);
    for (const call of assetWheres) {
      expect(call.params['tenantId']).toBe(TENANT_ID);
    }
    const itemJoin = joinCalls.find((sql) => sql.includes('item.tenant_id = balance.tenant_id'));
    expect(itemJoin).toBeDefined();
    for (const find of findWheres) {
      expect(find.where).toEqual(expect.objectContaining({ tenantId: TENANT_ID }));
    }
  });
});
