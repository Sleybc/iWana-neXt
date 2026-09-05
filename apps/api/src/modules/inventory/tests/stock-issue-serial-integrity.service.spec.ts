import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  InventoryTrackingMode,
  SerializedAssetStatus,
  StockBalanceCondition,
  StockIssueStatus,
  StockIssueType,
  UserRole,
} from '@iwana/shared';
import { StockIssueService } from '../services/stock-issue.service';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { StockBalanceService } from '../services/stock-balance.service';

jest.mock('@iwana/db', () => ({
  InventoryItem: class InventoryItem {},
  SerializedAsset: class SerializedAsset {},
  StockBalance: class StockBalance {},
  StockIssue: class StockIssue {},
  StockIssueLine: class StockIssueLine {},
  StockLocation: class StockLocation {},
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    }),
  },
  runInTenantSchema: jest.fn(),
}));

const actor: JwtPayload = {
  sub: 'support-001',
  email: 'support@example.test',
  role: UserRole.SUPPORT,
  tenantId: 'tenant-001',
  schemaName: 'tenant_001',
  jti: 'jti-support',
  type: 'tenant',
};

const SOURCE_ID = '11111111-1111-4111-8111-111111111111';
const DEST_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_LOCATION_ID = '99999999-9999-4999-8999-999999999999';
const SERIALIZED_ITEM_ID = '33333333-3333-4333-8333-333333333333';
const CONSUMABLE_ITEM_ID = '44444444-4444-4333-8333-444444444444';
const OTHER_ITEM_ID = '55555555-5555-4555-8555-555555555555';
const ASSET_ID = '66666666-6666-4666-8666-666666666666';
const ASSET_OTHER_ITEM_ID = '77777777-7777-4777-8777-777777777777';

const serializedItem = {
  id: SERIALIZED_ITEM_ID,
  sku: 'CFO-SER-ROGPN-TPL-XC220',
  trackingMode: InventoryTrackingMode.SERIALIZED,
};

const consumableItem = {
  id: CONSUMABLE_ITEM_ID,
  sku: 'CBL-DRP-001',
  trackingMode: InventoryTrackingMode.CONSUMABLE,
};

function buildAsset(overrides: Record<string, unknown> = {}) {
  return {
    id: ASSET_ID,
    tenantId: 'tenant-001',
    inventoryItemId: SERIALIZED_ITEM_ID,
    serialNumber: 'SN-0001',
    currentStatus: SerializedAssetStatus.AVAILABLE,
    currentLocationId: SOURCE_ID,
    ...overrides,
  };
}

interface SerialManagerOptions {
  items?: Array<Record<string, unknown>>;
  assets?: Array<Record<string, unknown>>;
  committedAssetIds?: string[];
}

/**
 * Manager falso para B3: `find` resuelve ítems/activos por id, el query
 * builder del chequeo de comprometidos responde con las filas indicadas.
 */
function buildSerialManager(options: SerialManagerOptions = {}) {
  const items = options.items ?? [serializedItem, consumableItem];
  const assets = options.assets ?? [buildAsset()];
  const committedAssetIds = new Set(options.committedAssetIds ?? []);

  const committedQb = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    getRawMany: jest
      .fn()
      .mockResolvedValue(
        [...committedAssetIds].map((serializedAssetId) => ({ serializedAssetId })),
      ),
  };

  const manager: any = {
    transaction: jest
      .fn()
      .mockImplementation(async (work: (m: unknown) => unknown) => work(manager)),
    find: jest.fn().mockImplementation(async (entity: any, query?: any) => {
      const ids: string[] = query?.where?.id?.value ?? [];
      if (entity?.name === 'InventoryItem') {
        return items.filter((item) => ids.includes(item['id'] as string));
      }
      if (entity?.name === 'SerializedAsset') {
        return assets.filter((asset) => ids.includes(asset['id'] as string));
      }
      if (entity?.name === 'StockIssueLine') {
        return [];
      }
      return [];
    }),
    findOne: jest
      .fn()
      .mockImplementation(
        async (entity: { name: string }, options?: { where?: { id?: string } }) => {
          if (entity?.name === 'StockLocation') {
            const isDestination = options?.where?.id === DEST_ID;
            return {
              id: options?.where?.id,
              tenantId: 'tenant-001',
              type: isDestination ? 'MOBILE_TECHNICIAN' : 'MAIN_WAREHOUSE',
            };
          }
          if (entity?.name === 'StockIssue') {
            return null;
          }
          return null;
        },
      ),
    create: jest.fn((_entity: unknown, payload: unknown) => payload),
    save: jest
      .fn()
      .mockImplementationOnce(async (_entity: unknown, payload: Record<string, unknown>) => ({
        id: 'issue-001',
        ...payload,
      }))
      .mockImplementation(async (_entity: unknown, payload: unknown) => payload),
    delete: jest.fn().mockResolvedValue({ affected: 0 }),
    createQueryBuilder: jest.fn().mockReturnValue(committedQb),
  };

  return { manager, committedQb };
}

function createService() {
  const balanceService = {
    getAvailabilityWithManager: jest
      .fn()
      .mockResolvedValue({ onHand: 10, reserved: 0, available: 10 }),
    applyDeltaWithManager: jest.fn().mockResolvedValue({}),
  } as unknown as StockBalanceService;
  const domainEventPublisher = {
    captureItemSnapshots: jest.fn().mockResolvedValue(new Map()),
    publishAfterCommittedMovement: jest.fn(),
  };
  return new StockIssueService(
    {} as DataSource,
    {} as never,
    balanceService,
    domainEventPublisher as never,
  );
}

function runWithManager(manager: unknown) {
  (runInTenantSchema as jest.Mock).mockImplementation(
    async (_ds: unknown, _schema: string, work: (qr: { manager: unknown }) => unknown) =>
      work({ manager }),
  );
  (TenantContext.getOrThrow as jest.Mock).mockReturnValue({
    tenantId: 'tenant-001',
    schemaName: 'tenant_001',
  });
}

interface SerialTestLine {
  itemId: string;
  requestedQty: number;
  condition: StockBalanceCondition;
  serializedAssetId?: string | null;
  lotId?: string | null;
}

function baseCreateInput(lines: SerialTestLine[]) {
  return {
    type: StockIssueType.TECHNICIAN_CUSTODY,
    sourceLocationId: SOURCE_ID,
    destinationLocationId: DEST_ID,
    lines,
  };
}

describe('StockIssueService integridad de serial (B3 · CA-S1-06)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rechaza 400 en español la línea serializada sin serializedAssetId', async () => {
    const { manager } = buildSerialManager();
    runWithManager(manager);

    await expect(
      createService().create(
        baseCreateInput([
          { itemId: SERIALIZED_ITEM_ID, requestedQty: 1, condition: StockBalanceCondition.NEW },
        ]),
        actor,
      ),
    ).rejects.toThrow(
      'El ítem CFO-SER-ROGPN-TPL-XC220 exige seleccionar el activo serializado que sale.',
    );
  });

  it('rechaza el serial que pertenece a otro artículo', async () => {
    const { manager } = buildSerialManager({
      assets: [buildAsset({ inventoryItemId: OTHER_ITEM_ID })],
    });
    runWithManager(manager);

    await expect(
      createService().create(
        baseCreateInput([
          {
            itemId: SERIALIZED_ITEM_ID,
            requestedQty: 1,
            serializedAssetId: ASSET_ID,
            condition: StockBalanceCondition.NEW,
          },
        ]),
        actor,
      ),
    ).rejects.toThrow('pertenece a otro artículo');
  });

  it('rechaza el serial que no está en la bodega de origen', async () => {
    const { manager } = buildSerialManager({
      assets: [buildAsset({ currentLocationId: OTHER_LOCATION_ID })],
    });
    runWithManager(manager);

    await expect(
      createService().create(
        baseCreateInput([
          {
            itemId: SERIALIZED_ITEM_ID,
            requestedQty: 1,
            serializedAssetId: ASSET_ID,
            condition: StockBalanceCondition.NEW,
          },
        ]),
        actor,
      ),
    ).rejects.toThrow('no está en la bodega de origen');
  });

  it('rechaza el serial en estado no disponible', async () => {
    const { manager } = buildSerialManager({
      assets: [buildAsset({ currentStatus: SerializedAssetStatus.ASSIGNED_TO_TECHNICIAN })],
    });
    runWithManager(manager);

    await expect(
      createService().create(
        baseCreateInput([
          {
            itemId: SERIALIZED_ITEM_ID,
            requestedQty: 1,
            serializedAssetId: ASSET_ID,
            condition: StockBalanceCondition.NEW,
          },
        ]),
        actor,
      ),
    ).rejects.toThrow('no está disponible para salida');
  });

  it('rechaza el serial repetido entre líneas de la misma salida', async () => {
    const { manager } = buildSerialManager();
    runWithManager(manager);

    await expect(
      createService().create(
        baseCreateInput([
          {
            itemId: SERIALIZED_ITEM_ID,
            requestedQty: 1,
            serializedAssetId: ASSET_ID,
            condition: StockBalanceCondition.NEW,
          },
          {
            itemId: SERIALIZED_ITEM_ID,
            requestedQty: 1,
            serializedAssetId: ASSET_ID,
            condition: StockBalanceCondition.NEW,
          },
        ]),
        actor,
      ),
    ).rejects.toThrow('está repetido en la salida');
  });

  it('rechaza cantidad distinta de 1 en línea con serial (adelanto de dispatch)', async () => {
    const { manager } = buildSerialManager();
    runWithManager(manager);

    await expect(
      createService().create(
        baseCreateInput([
          {
            itemId: SERIALIZED_ITEM_ID,
            requestedQty: 2,
            serializedAssetId: ASSET_ID,
            condition: StockBalanceCondition.NEW,
          },
        ]),
        actor,
      ),
    ).rejects.toThrow('deben solicitar cantidad 1');
  });

  it('rechaza el serial comprometido por otra salida no terminal', async () => {
    const { manager } = buildSerialManager({ committedAssetIds: [ASSET_ID] });
    runWithManager(manager);

    await expect(
      createService().create(
        baseCreateInput([
          {
            itemId: SERIALIZED_ITEM_ID,
            requestedQty: 1,
            serializedAssetId: ASSET_ID,
            condition: StockBalanceCondition.NEW,
          },
        ]),
        actor,
      ),
    ).rejects.toThrow('ya está comprometido en otra salida');
  });

  it('rechaza con 400 (no 404) cuando el activo no existe', async () => {
    const { manager } = buildSerialManager({ assets: [] });
    runWithManager(manager);

    const error = await createService()
      .create(
        baseCreateInput([
          {
            itemId: SERIALIZED_ITEM_ID,
            requestedQty: 1,
            serializedAssetId: ASSET_ID,
            condition: StockBalanceCondition.NEW,
          },
        ]),
        actor,
      )
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
  });

  it('crea la salida cuando el serial es válido (control positivo)', async () => {
    const { manager } = buildSerialManager();
    runWithManager(manager);

    const created = await createService().create(
      baseCreateInput([
        {
          itemId: SERIALIZED_ITEM_ID,
          requestedQty: 1,
          serializedAssetId: ASSET_ID,
          condition: StockBalanceCondition.NEW,
        },
        { itemId: CONSUMABLE_ITEM_ID, requestedQty: 3, condition: StockBalanceCondition.NEW },
      ]),
      actor,
    );

    expect(created.lines).toHaveLength(2);
  });

  it('el update que reemplaza líneas revalida el serial contra la bodega nueva', async () => {
    const issue = {
      id: 'issue-001',
      tenantId: 'tenant-001',
      type: StockIssueType.TECHNICIAN_CUSTODY,
      status: StockIssueStatus.REQUESTED,
      sourceLocationId: SOURCE_ID,
      destinationLocationId: DEST_ID,
    };
    const manager: any = {
      transaction: jest
        .fn()
        .mockImplementation(async (work: (m: unknown) => unknown) => work(manager)),
      find: jest.fn().mockImplementation(async (entity: any, query?: any) => {
        if (entity?.name === 'InventoryItem') {
          return [serializedItem];
        }
        if (entity?.name === 'SerializedAsset') {
          return [];
        }
        if (entity?.name === 'StockIssueLine') {
          return [];
        }
        return [];
      }),
      findOne: jest
        .fn()
        .mockImplementation(
          async (entity: { name: string }, options?: { where?: { id?: string } }) => {
            if (entity?.name === 'StockIssue') {
              return issue;
            }
            if (entity?.name === 'StockLocation') {
              const isDestination = options?.where?.id === DEST_ID;
              return {
                id: options?.where?.id,
                tenantId: 'tenant-001',
                type: isDestination ? 'MOBILE_TECHNICIAN' : 'MAIN_WAREHOUSE',
              };
            }
            return null;
          },
        ),
      create: jest.fn((_entity: unknown, payload: unknown) => payload),
      save: jest.fn().mockImplementation(async (_entity: unknown, payload: unknown) => payload),
      delete: jest.fn().mockResolvedValue({ affected: 0 }),
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      }),
    };
    runWithManager(manager);

    await expect(
      createService().update(
        'issue-001',
        {
          lines: [
            { itemId: SERIALIZED_ITEM_ID, requestedQty: 1, condition: StockBalanceCondition.NEW },
          ],
        },
        actor,
      ),
    ).rejects.toThrow('exige seleccionar el activo serializado que sale');
  });
});
