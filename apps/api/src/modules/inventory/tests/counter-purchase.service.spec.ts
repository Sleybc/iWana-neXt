import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  AssetLifecycleEventType,
  InventoryTrackingMode,
  SerializedAssetStatus,
  StockBalanceCondition,
  StockMovementOrigin,
  UserRole,
} from '@iwana/shared';
import {
  InventoryItem,
  StockLocation,
  StockLot,
  StockMovement,
  StockMovementLine,
  TenantContext,
  runInTenantSchema,
} from '@iwana/db';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { CounterPurchaseService } from '../services/counter-purchase.service';
import { CreateCounterPurchaseInput } from '../dto';

jest.mock('@iwana/db', () => ({
  InventoryItem: class InventoryItem {},
  StockLocation: class StockLocation {},
  StockLot: class StockLot {},
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

const actor: JwtPayload = {
  sub: 'support-001',
  email: 'support@example.test',
  role: UserRole.SUPPORT,
  tenantId: 'tenant-001',
  schemaName: 'tenant_001',
  jti: 'jti-support',
  type: 'tenant',
};

const PARTY_REF_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LOCATION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ITEM_CONSUMABLE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ITEM_SERIALIZED_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

describe('CounterPurchaseService', () => {
  const inventoryCostingServiceMock = {
    applyReceiptCostingWithManager: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (TenantContext.getOrThrow as jest.Mock).mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    });
  });

  function buildManager(options?: {
    item?: Partial<InventoryItem> | null;
    location?: Partial<StockLocation> | null;
    existingMovement?: { id: string; idempotencyKey: string } | null;
  }) {
    const item =
      options?.item === null
        ? null
        : {
            id: ITEM_CONSUMABLE_ID,
            tenantId: 'tenant-001',
            trackingMode: InventoryTrackingMode.CONSUMABLE,
            usefulLifeMonths: null,
            ...(options?.item ?? {}),
          };

    const location =
      options?.location === null
        ? null
        : {
            id: LOCATION_ID,
            tenantId: 'tenant-001',
            ...(options?.location ?? {}),
          };
    const existingMovement = options?.existingMovement ?? null;

    const save = jest.fn().mockImplementation(async (_entity, payload) => ({
      id: 'lot-001',
      ...payload,
    }));

    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      query: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockImplementation(async (entity, query) => {
        if (entity === StockMovement) {
          return query.where.idempotencyKey === existingMovement?.idempotencyKey
            ? existingMovement
            : null;
        }

        if (entity === StockLocation) {
          return query.where.id === location?.id ? location : null;
        }

        if (entity === InventoryItem) {
          return query.where.id === item?.id ? item : null;
        }

        return null;
      }),
      find: jest.fn().mockImplementation(async (entity, query) => {
        if (entity === StockMovementLine) {
          return query.where.movementId === existingMovement?.id
            ? [{ id: 'existing-line-001', movementId: query.where.movementId }]
            : [];
        }

        return [];
      }),
      create: jest.fn((_entity, payload) => payload),
      save,
    };

    return { manager, save };
  }

  it('registers a non-serialized counter purchase through the ledger', async () => {
    const { manager } = buildManager();
    const stockLedgerServiceMock = {
      recordMovementWithManager: jest.fn().mockResolvedValue({
        movement: {
          id: 'mov-001',
          movementNumber: 'MOV-000010',
          origin: StockMovementOrigin.COUNTER_PURCHASE,
        },
        lines: [{ id: 'line-001', quantity: '5.00' }],
      }),
    };
    const serializedAssetServiceMock = {
      normalizeSerial: jest.fn((serial: string) => serial.trim().toUpperCase()),
      createReceivedAssetWithManager: jest.fn(),
    };

    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
      work({ manager }),
    );

    const service = new CounterPurchaseService(
      {} as DataSource,
      stockLedgerServiceMock as never,
      serializedAssetServiceMock as never,
      inventoryCostingServiceMock as never,
    );

    const result = await service.record(
      {
        partyRefId: PARTY_REF_ID,
        invoiceNumber: 'FAC-12345',
        destinationLocationId: LOCATION_ID,
        lines: [
          {
            itemId: ITEM_CONSUMABLE_ID,
            quantityReceived: 5,
            unitCost: 1200,
            condition: StockBalanceCondition.NEW,
            serialNumbers: [],
          },
        ],
      },
      actor,
    );

    expect(result.movement.movementNumber).toBe('MOV-000010');
    expect(stockLedgerServiceMock.recordMovementWithManager).toHaveBeenCalledWith(
      manager,
      'tenant-001',
      expect.objectContaining({
        origin: StockMovementOrigin.COUNTER_PURCHASE,
        originContext: 'inventory.counter-purchase',
        originRefId: PARTY_REF_ID,
        idempotencyKey: expect.stringMatching(
          new RegExp(`^counter-purchase:${PARTY_REF_ID}:FAC-12345:[a-f0-9]{16}$`),
        ),
        lines: [expect.objectContaining({ quantity: 5, unitCost: 1200 })],
      }),
      actor,
    );
    expect(inventoryCostingServiceMock.applyReceiptCostingWithManager).toHaveBeenCalledWith(
      manager,
      'tenant-001',
      [expect.objectContaining({ itemId: ITEM_CONSUMABLE_ID, unitCost: 1200, quantity: 5 })],
    );
  });

  it('returns an existing movement before creating lots or assets on idempotent retry', async () => {
    const idempotencyKey = 'counter-purchase:retry-key';
    const { manager, save } = buildManager({
      existingMovement: { id: 'mov-existing-001', idempotencyKey },
    });
    const stockLedgerServiceMock = {
      recordMovementWithManager: jest.fn(),
    };
    const serializedAssetServiceMock = {
      normalizeSerial: jest.fn((serial: string) => serial.trim().toUpperCase()),
      createReceivedAssetWithManager: jest.fn(),
    };

    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
      work({ manager }),
    );

    const service = new CounterPurchaseService(
      {} as DataSource,
      stockLedgerServiceMock as never,
      serializedAssetServiceMock as never,
      inventoryCostingServiceMock as never,
    );

    const result = await service.record(
      {
        partyRefId: PARTY_REF_ID,
        invoiceNumber: 'FAC-RETRY',
        destinationLocationId: LOCATION_ID,
        idempotencyKey,
        lines: [
          {
            itemId: ITEM_CONSUMABLE_ID,
            quantityReceived: 1,
            unitCost: 100,
            serialNumbers: [],
            condition: StockBalanceCondition.NEW,
          },
        ],
      },
      actor,
    );

    expect(result.movement.id).toBe('mov-existing-001');
    expect(result.lines).toEqual([{ id: 'existing-line-001', movementId: 'mov-existing-001' }]);
    expect(save).not.toHaveBeenCalled();
    expect(serializedAssetServiceMock.createReceivedAssetWithManager).not.toHaveBeenCalled();
    expect(stockLedgerServiceMock.recordMovementWithManager).not.toHaveBeenCalled();
  });

  it('creates serialized assets and transitions them to AVAILABLE', async () => {
    const { manager } = buildManager({
      item: {
        id: ITEM_SERIALIZED_ID,
        trackingMode: InventoryTrackingMode.SERIALIZED,
        usefulLifeMonths: 36,
      },
    });

    manager.findOne = jest.fn().mockImplementation(async (entity, query) => {
      if (entity === StockLocation) {
        return { id: LOCATION_ID, tenantId: 'tenant-001' };
      }

      if (entity === InventoryItem && query.where.id === ITEM_SERIALIZED_ID) {
        return {
          id: ITEM_SERIALIZED_ID,
          tenantId: 'tenant-001',
          trackingMode: InventoryTrackingMode.SERIALIZED,
          usefulLifeMonths: 36,
        };
      }

      return null;
    });

    const stockLedgerServiceMock = {
      recordMovementWithManager: jest.fn().mockResolvedValue({
        movement: { id: 'mov-002', movementNumber: 'MOV-000011' },
        lines: [{ id: 'line-002' }, { id: 'line-003' }],
      }),
    };
    const serializedAssetServiceMock = {
      normalizeSerial: jest.fn((serial: string) => serial.trim().toUpperCase()),
      createReceivedAssetWithManager: jest
        .fn()
        .mockResolvedValueOnce({ id: 'asset-001' })
        .mockResolvedValueOnce({ id: 'asset-002' }),
    };

    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
      work({ manager }),
    );

    const service = new CounterPurchaseService(
      {} as DataSource,
      stockLedgerServiceMock as never,
      serializedAssetServiceMock as never,
      inventoryCostingServiceMock as never,
    );

    await service.record(
      {
        partyRefId: PARTY_REF_ID,
        invoiceNumber: 'FAC-SER-01',
        destinationLocationId: LOCATION_ID,
        lines: [
          {
            itemId: ITEM_SERIALIZED_ID,
            quantityReceived: 2,
            unitCost: 350000,
            serialNumbers: ['SN-001', 'SN-002'],
            condition: StockBalanceCondition.NEW,
          },
        ],
      },
      actor,
    );

    expect(serializedAssetServiceMock.createReceivedAssetWithManager).toHaveBeenCalledTimes(2);
    expect(stockLedgerServiceMock.recordMovementWithManager).toHaveBeenCalledWith(
      manager,
      'tenant-001',
      expect.objectContaining({
        assetTransitions: expect.arrayContaining([
          expect.objectContaining({
            serializedAssetId: 'asset-001',
            toStatus: SerializedAssetStatus.AVAILABLE,
            eventType: AssetLifecycleEventType.RECEIVED,
          }),
        ]),
      }),
      actor,
    );
  });

  it('deduplicates repeated submissions through idempotency key', async () => {
    const { manager } = buildManager();
    const stockLedgerServiceMock = {
      recordMovementWithManager: jest.fn().mockResolvedValue({
        movement: { id: 'mov-003', movementNumber: 'MOV-000012' },
        lines: [{ id: 'line-004' }],
      }),
    };
    const serializedAssetServiceMock = {
      normalizeSerial: jest.fn((serial: string) => serial.trim().toUpperCase()),
      createReceivedAssetWithManager: jest.fn(),
    };

    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
      work({ manager }),
    );

    const service = new CounterPurchaseService(
      {} as DataSource,
      stockLedgerServiceMock as never,
      serializedAssetServiceMock as never,
      inventoryCostingServiceMock as never,
    );

    const payload: CreateCounterPurchaseInput = {
      partyRefId: PARTY_REF_ID,
      invoiceNumber: 'FAC-IDEM',
      destinationLocationId: LOCATION_ID,
      idempotencyKey: 'counter-purchase:manual-key',
      lines: [
        {
          itemId: ITEM_CONSUMABLE_ID,
          quantityReceived: 1,
          unitCost: 100,
          serialNumbers: [],
          condition: StockBalanceCondition.NEW,
        },
      ],
    };

    await service.record(payload, actor);
    await service.record(payload, actor);

    expect(stockLedgerServiceMock.recordMovementWithManager).toHaveBeenCalledTimes(2);
    expect(stockLedgerServiceMock.recordMovementWithManager).toHaveBeenNthCalledWith(
      1,
      manager,
      'tenant-001',
      expect.objectContaining({ idempotencyKey: 'counter-purchase:manual-key' }),
      actor,
    );
  });

  it('adquiere lock transaccional por idempotencyKey antes de crear lotes', async () => {
    const { manager } = buildManager();
    const stockLedgerServiceMock = {
      recordMovementWithManager: jest.fn().mockResolvedValue({
        movement: { id: 'mov-001', movementNumber: 'MOV-000010' },
        lines: [],
      }),
    };

    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
      work({ manager }),
    );

    const service = new CounterPurchaseService(
      {} as DataSource,
      stockLedgerServiceMock as never,
      { normalizeSerial: jest.fn(), createReceivedAssetWithManager: jest.fn() } as never,
      inventoryCostingServiceMock as never,
    );

    await service.record(
      {
        partyRefId: PARTY_REF_ID,
        invoiceNumber: 'FAC-LOCK',
        destinationLocationId: LOCATION_ID,
        idempotencyKey: 'counter-purchase:lock-key',
        lines: [
          {
            itemId: ITEM_CONSUMABLE_ID,
            quantityReceived: 1,
            unitCost: 10,
            serialNumbers: [],
            condition: StockBalanceCondition.NEW,
          },
        ],
      },
      actor,
    );

    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('pg_advisory_xact_lock'), [
      'counter-purchase:lock-key',
    ]);
  });

  it('rejects counter purchase without destination location', async () => {
    const { manager } = buildManager({ location: null });
    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
      work({ manager }),
    );

    const service = new CounterPurchaseService(
      {} as DataSource,
      {} as never,
      {} as never,
      inventoryCostingServiceMock as never,
    );

    await expect(
      service.record(
        {
          partyRefId: PARTY_REF_ID,
          invoiceNumber: 'FAC-404',
          destinationLocationId: LOCATION_ID,
          lines: [
            {
              itemId: ITEM_CONSUMABLE_ID,
              quantityReceived: 1,
              unitCost: 10,
              serialNumbers: [],
              condition: StockBalanceCondition.NEW,
            },
          ],
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects serialized lines when serial count differs from quantity', async () => {
    const { manager } = buildManager({
      item: {
        id: ITEM_SERIALIZED_ID,
        trackingMode: InventoryTrackingMode.SERIALIZED,
      },
    });

    manager.findOne = jest.fn().mockImplementation(async (entity, query) => {
      if (entity === StockLocation) {
        return { id: LOCATION_ID, tenantId: 'tenant-001' };
      }

      if (entity === InventoryItem) {
        return {
          id: ITEM_SERIALIZED_ID,
          tenantId: 'tenant-001',
          trackingMode: InventoryTrackingMode.SERIALIZED,
          usefulLifeMonths: null,
        };
      }

      return null;
    });

    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, work) =>
      work({ manager }),
    );

    const service = new CounterPurchaseService(
      {} as DataSource,
      {} as never,
      {} as never,
      inventoryCostingServiceMock as never,
    );

    await expect(
      service.record(
        {
          partyRefId: PARTY_REF_ID,
          invoiceNumber: 'FAC-SER-BAD',
          destinationLocationId: LOCATION_ID,
          lines: [
            {
              itemId: ITEM_SERIALIZED_ID,
              quantityReceived: 2,
              unitCost: 100,
              serialNumbers: ['SN-ONLY-ONE'],
              condition: StockBalanceCondition.NEW,
            },
          ],
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
