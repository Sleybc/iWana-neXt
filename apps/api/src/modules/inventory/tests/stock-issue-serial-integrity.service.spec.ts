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
  StockIssueLineSerial: class StockIssueLineSerial {},
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
const ASSET_A = '66666666-6666-4666-8666-666666666666';
const ASSET_B = '88888888-8888-4888-8888-888888888888';

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
    id: ASSET_A,
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
  /** Seriales comprometidos por OTRA salida (respuesta del pre-chequeo sobre la hija). */
  committedAssetIds?: string[];
  saveError?: unknown;
}

/**
 * Manager falso para B3: `find` resuelve ítems/activos por id, el query
 * builder del pre-chequeo de comprometidos (tabla hija) responde con las
 * filas indicadas y `save` puede forzar el error de carrera del índice único.
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
    save: jest.fn().mockImplementation(async (entity: { name?: string }, payload: unknown) => {
      if (options.saveError && entity?.name === 'StockIssueLineSerial') {
        throw options.saveError;
      }
      if (Array.isArray(payload)) {
        return payload.map((row, index) => ({
          id: `${entity?.name ?? 'row'}-${index}-saved`,
          ...(row as Record<string, unknown>),
        }));
      }
      return { id: `${entity?.name ?? 'row'}-saved`, ...(payload as Record<string, unknown>) };
    }),
    delete: jest.fn().mockResolvedValue({ affected: 0 }),
    createQueryBuilder: jest.fn().mockReturnValue(committedQb),
  };

  return { manager, committedQb };
}

function createService(balanceOverrides?: Partial<Record<string, jest.Mock>>) {
  const balanceService = {
    getAvailabilityWithManager: jest
      .fn()
      .mockResolvedValue({ onHand: 10, reserved: 0, available: 10 }),
    applyDeltaWithManager: jest.fn().mockResolvedValue({}),
    ...balanceOverrides,
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
  serializedAssetIds?: string[];
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

describe('StockIssueService integridad del grupo de seriales (MOD12 S2 · B3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('CA-S2-05: acepta una línea con N seriales como una línea de cantidad N y reserva N', async () => {
    const { manager } = buildSerialManager({
      assets: [buildAsset(), buildAsset({ id: ASSET_B, serialNumber: 'SN-0002' })],
    });
    runWithManager(manager);
    const balanceService = {
      getAvailabilityWithManager: jest
        .fn()
        .mockResolvedValue({ onHand: 10, reserved: 0, available: 10 }),
      applyDeltaWithManager: jest.fn().mockResolvedValue({}),
    };

    const created = await createService(balanceService).create(
      baseCreateInput([
        {
          itemId: SERIALIZED_ITEM_ID,
          requestedQty: 2,
          serializedAssetIds: [ASSET_A, ASSET_B],
          condition: StockBalanceCondition.NEW,
        },
      ]),
      actor,
    );

    expect(created.lines).toHaveLength(1);
    expect(balanceService.applyDeltaWithManager).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ reservedDelta: 2, delta: 0 }),
    );
  });

  it('rechaza la línea serializada sin seriales (400 en español)', async () => {
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
      'El ítem CFO-SER-ROGPN-TPL-XC220 exige seleccionar los activos serializados que salen.',
    );
  });

  it('rechaza la cantidad incoherente con el número de seriales del grupo', async () => {
    const { manager } = buildSerialManager({
      assets: [buildAsset(), buildAsset({ id: ASSET_B, serialNumber: 'SN-0002' })],
    });
    runWithManager(manager);

    await expect(
      createService().create(
        baseCreateInput([
          {
            itemId: SERIALIZED_ITEM_ID,
            requestedQty: 3,
            serializedAssetIds: [ASSET_A, ASSET_B],
            condition: StockBalanceCondition.NEW,
          },
        ]),
        actor,
      ),
    ).rejects.toThrow(
      'La cantidad solicitada del ítem CFO-SER-ROGPN-TPL-XC220 debe coincidir con el número de seriales seleccionados (2 seriales, cantidad 3).',
    );
  });

  it('rechaza el serial que pertenece a otro artículo (CA-S2-06)', async () => {
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
            serializedAssetIds: [ASSET_A],
            condition: StockBalanceCondition.NEW,
          },
        ]),
        actor,
      ),
    ).rejects.toThrow('pertenece a otro artículo');
  });

  it('rechaza el serial que no está en la bodega de origen (CA-S2-06)', async () => {
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
            serializedAssetIds: [ASSET_A],
            condition: StockBalanceCondition.NEW,
          },
        ]),
        actor,
      ),
    ).rejects.toThrow('no está en la bodega de origen');
  });

  it('rechaza el serial en estado no disponible (CA-S2-06)', async () => {
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
            serializedAssetIds: [ASSET_A],
            condition: StockBalanceCondition.NEW,
          },
        ]),
        actor,
      ),
    ).rejects.toThrow('no está disponible para salida');
  });

  it('rechaza el serial comprometido por otra salida no terminal (pre-chequeo amable)', async () => {
    const { manager, committedQb } = buildSerialManager({ committedAssetIds: [ASSET_A] });
    runWithManager(manager);

    await expect(
      createService().create(
        baseCreateInput([
          {
            itemId: SERIALIZED_ITEM_ID,
            requestedQty: 1,
            serializedAssetIds: [ASSET_A],
            condition: StockBalanceCondition.NEW,
          },
        ]),
        actor,
      ),
    ).rejects.toThrow('ya está comprometido en otra salida');

    // El pre-chequeo vive en la tabla hija con el predicado de estados no terminales.
    expect(committedQb.where).toHaveBeenCalledWith('serial.tenant_id = :tenantId', {
      tenantId: 'tenant-001',
    });
    const terminalCall = committedQb.andWhere.mock.calls.find((call: unknown[]) =>
      String(call[0]).includes('issue_status NOT IN'),
    );
    expect(terminalCall).toBeDefined();
    expect(terminalCall?.[1]).toEqual({
      serialTerminalStatuses: [
        StockIssueStatus.CANCELLED,
        StockIssueStatus.DISPATCHED,
        StockIssueStatus.RECEIVED,
      ],
    });
  });

  it('un serial despachado (estado terminal en la espejo) puede comprometerse en una salida nueva', async () => {
    // El pre-chequeo filtra por issue_status NOT IN (terminal): un serial cuya
    // fila hija quedó en DISPATCHED no vuelve a aparecer como comprometido.
    const { manager, committedQb } = buildSerialManager({ committedAssetIds: [] });
    runWithManager(manager);

    const created = await createService().create(
      baseCreateInput([
        {
          itemId: SERIALIZED_ITEM_ID,
          requestedQty: 1,
          serializedAssetIds: [ASSET_A],
          condition: StockBalanceCondition.NEW,
        },
      ]),
      actor,
    );

    expect(created.lines).toHaveLength(1);
    expect(committedQb.getRawMany).toHaveBeenCalledTimes(1);
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
            serializedAssetIds: [ASSET_A],
            condition: StockBalanceCondition.NEW,
          },
        ]),
        actor,
      )
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
  });

  it('crea la salida con grupo y singular de compatibilidad S1 (control positivo)', async () => {
    const { manager } = buildSerialManager();
    runWithManager(manager);

    const created = await createService().create(
      baseCreateInput([
        {
          itemId: SERIALIZED_ITEM_ID,
          requestedQty: 1,
          serializedAssetId: ASSET_A, // payload singular S1, normalizado en el borde del schema
          condition: StockBalanceCondition.NEW,
        },
        { itemId: CONSUMABLE_ITEM_ID, requestedQty: 3, condition: StockBalanceCondition.NEW },
      ]),
      actor,
    );

    expect(created.lines).toHaveLength(2);
  });

  it('alimenta el singular de transición con el primer serial del grupo y persiste la hija', async () => {
    const { manager } = buildSerialManager({
      assets: [buildAsset(), buildAsset({ id: ASSET_B, serialNumber: 'SN-0002' })],
    });
    runWithManager(manager);

    await createService().create(
      baseCreateInput([
        {
          itemId: SERIALIZED_ITEM_ID,
          requestedQty: 2,
          serializedAssetIds: [ASSET_A, ASSET_B],
          condition: StockBalanceCondition.NEW,
        },
      ]),
      actor,
    );

    const serialSave = (manager.save as jest.Mock).mock.calls.find(
      (call: unknown[]) => (call[0] as { name?: string })?.name === 'StockIssueLineSerial',
    );
    expect(serialSave).toBeDefined();
    const rows = serialSave?.[1] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        serializedAssetId: ASSET_A,
        issueStatus: StockIssueStatus.REQUESTED,
        issueId: 'StockIssue-saved',
      }),
    );

    const lineSave = (manager.save as jest.Mock).mock.calls.find(
      (call: unknown[]) => (call[0] as { name?: string })?.name === 'StockIssueLine',
    );
    const linePayload = (lineSave?.[1] as Array<Record<string, unknown>>)?.[0];
    expect(linePayload?.serializedAssetId).toBe(ASSET_A);
    expect(linePayload?.requestedQty).toBe('2.00');
  });

  it('traduce la carrera del índice único parcial (23505) a 400 en español', async () => {
    const { manager } = buildSerialManager({ saveError: { code: '23505' } });
    runWithManager(manager);

    const error = await createService()
      .create(
        baseCreateInput([
          {
            itemId: SERIALIZED_ITEM_ID,
            requestedQty: 1,
            serializedAssetIds: [ASSET_A],
            condition: StockBalanceCondition.NEW,
          },
        ]),
        actor,
      )
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).message).toContain('ya está comprometido en otra salida');
  });

  it('el update que reemplaza líneas revalida el grupo contra la bodega nueva', async () => {
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
      find: jest.fn().mockImplementation(async (entity: any) => {
        if (entity?.name === 'InventoryItem') {
          return [serializedItem];
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
    ).rejects.toThrow('exige seleccionar los activos serializados que salen');
  });
});
