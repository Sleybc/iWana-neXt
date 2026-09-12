import { DataSource } from 'typeorm';
import {
  InventoryTrackingMode,
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
  jti: 'jti-f5b-counter',
  type: 'tenant',
};

const PARTY_REF_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LOCATION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ITEM_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const mockRunInTenantSchema = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;

function buildManager(itemOverrides: Record<string, unknown> = {}) {
  const item = {
    id: ITEM_ID,
    tenantId: 'tenant-001',
    trackingMode: InventoryTrackingMode.CONSUMABLE,
    unitOfMeasure: 'UNIT',
    purchaseUnitOfMeasure: 'BOX',
    purchaseToBaseUomFactor: '100',
    usefulLifeMonths: null,
    ...itemOverrides,
  };
  const location = { id: LOCATION_ID, tenantId: 'tenant-001' };

  const manager = {
    transaction: jest.fn().mockImplementation(async (work) => work(manager)),
    query: jest.fn().mockResolvedValue([]),
    findOne: jest
      .fn()
      .mockImplementation(async (entity: unknown, where: { where: Record<string, unknown> }) => {
        if (entity === StockMovement) {
          return null;
        }
        if (entity === StockLocation) {
          return where.where.id === location.id ? location : null;
        }
        if (entity === InventoryItem) {
          return where.where.id === item.id ? item : null;
        }
        return null;
      }),
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn((_entity: unknown, payload: Record<string, unknown>) => payload),
    save: jest
      .fn()
      .mockImplementation(async (_entity: unknown, payload: Record<string, unknown>) => ({
        id: 'lot-001',
        ...payload,
      })),
  };

  return manager;
}

function buildService(manager: ReturnType<typeof buildManager>) {
  const stockLedgerServiceMock = {
    recordMovementWithManager: jest.fn().mockResolvedValue({
      movement: { id: 'mov-001', movementNumber: 'MOV-000010' },
      lines: [{ id: 'line-001' }],
      created: true,
    }),
  };
  const serializedAssetServiceMock = {
    normalizeSerial: jest.fn((serial: string) => serial.trim().toUpperCase()),
    createReceivedAssetWithManager: jest
      .fn()
      .mockImplementation(async (_manager: unknown, input: { serialNumber: string }) => ({
        id: `asset-${input.serialNumber}`,
      })),
  };

  mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));

  const service = new CounterPurchaseService(
    {} as DataSource,
    stockLedgerServiceMock as never,
    serializedAssetServiceMock as never,
    { applyReceiptCostingWithManager: jest.fn().mockResolvedValue(undefined) } as never,
    {
      captureItemSnapshots: jest.fn().mockResolvedValue(new Map()),
      publishAfterCommittedMovement: jest.fn(),
    } as never,
    { listByContext: jest.fn().mockResolvedValue([]) } as never,
  );

  return { service, stockLedgerServiceMock, serializedAssetServiceMock };
}

function counterInput(overrides: Record<string, unknown> = {}) {
  return {
    partyRefId: PARTY_REF_ID,
    invoiceNumber: 'FAC-12345',
    destinationLocationId: LOCATION_ID,
    lines: [
      {
        itemId: ITEM_ID,
        quantityReceived: 2,
        unitCost: 50000,
        serialNumbers: [],
        condition: StockBalanceCondition.NEW,
      },
    ],
    ...overrides,
  };
}

/**
 * Compra de mostrador también convierte (ADR-050 revisado en F5b · CA-F5B-11):
 * es el segundo flujo de entrada de mercancía comprada y aplica el mismo
 * resolutor único exactamente una vez por línea.
 */
describe('CounterPurchaseService — conversión compra → base (F5b)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (TenantContext.getOrThrow as jest.Mock).mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    });
  });

  it('2 cajas × 100 registran 200 unidades con costo base 500 y equivalencia en notas', async () => {
    const manager = buildManager();
    const { service, stockLedgerServiceMock } = buildService(manager);

    await service.record(counterInput(), actor);

    const input = stockLedgerServiceMock.recordMovementWithManager.mock.calls[0]?.[2] as {
      origin: StockMovementOrigin;
      notes: string;
      lines: Array<{ quantity: number; unitCost: number }>;
    };
    expect(input.origin).toBe(StockMovementOrigin.COUNTER_PURCHASE);
    expect(input.lines).toEqual([expect.objectContaining({ quantity: 200, unitCost: 500 })]);
    expect(input.notes).toMatch(/Factura\/soporte: FAC-12345/);
    expect(input.notes).toMatch(/2 cajas = 200 unidades/);
  });

  it('sin unidad de compra ni factor el comportamiento es idéntico al anterior', async () => {
    const manager = buildManager({ purchaseUnitOfMeasure: null, purchaseToBaseUomFactor: null });
    const { service, stockLedgerServiceMock } = buildService(manager);

    await service.record(counterInput(), actor);

    const input = stockLedgerServiceMock.recordMovementWithManager.mock.calls[0]?.[2] as {
      notes: string;
      lines: Array<{ quantity: number; unitCost: number }>;
    };
    expect(input.lines).toEqual([expect.objectContaining({ quantity: 2, unitCost: 50000 })]);
    expect(input.notes).not.toMatch(/Equivalencias/);
  });

  it('rechaza unidad de compra distinta sin factor (nunca se asume 1)', async () => {
    const manager = buildManager({ purchaseToBaseUomFactor: null });
    const { service, stockLedgerServiceMock } = buildService(manager);

    await expect(service.record(counterInput(), actor)).rejects.toThrow(
      /factor de conversión válido/,
    );
    expect(stockLedgerServiceMock.recordMovementWithManager).not.toHaveBeenCalled();
  });

  it('rechaza maestro legacy dimensionalmente inválido (metro → litro)', async () => {
    const manager = buildManager({
      unitOfMeasure: 'METER',
      purchaseUnitOfMeasure: 'LITER',
      purchaseToBaseUomFactor: '1',
    });
    const { service, stockLedgerServiceMock } = buildService(manager);

    await expect(service.record(counterInput(), actor)).rejects.toThrow(/dimensiones distintas/);
    expect(stockLedgerServiceMock.recordMovementWithManager).not.toHaveBeenCalled();
  });

  it('en serializados exige un serial por unidad base (2 cajas × 2 = 4 seriales)', async () => {
    const manager = buildManager({
      trackingMode: InventoryTrackingMode.SERIALIZED,
      purchaseToBaseUomFactor: '2',
    });
    const { service, stockLedgerServiceMock } = buildService(manager);

    await expect(
      service.record(
        counterInput({ lines: [{ ...counterInput().lines[0], serialNumbers: ['S-1', 'S-2'] }] }),
        actor,
      ),
    ).rejects.toThrow(/unidad base/);

    await service.record(
      counterInput({
        lines: [{ ...counterInput().lines[0], serialNumbers: ['S-1', 'S-2', 'S-3', 'S-4'] }],
      }),
      actor,
    );
    const input = stockLedgerServiceMock.recordMovementWithManager.mock.calls[0]?.[2] as {
      lines: Array<{ quantity: number }>;
    };
    expect(input.lines).toHaveLength(4);
  });
});

/**
 * Lote de origen del activo serializado en compra de mostrador (migración 129).
 *
 * La compra de mostrador es la segunda entrada de mercancía y crea su propio
 * `StockLot`: si no persistiera el vínculo, los seriales ingresados por este
 * camino quedarían sin lote y la validación de salida no tendría qué comparar.
 */
describe('CounterPurchaseService — lote de origen del activo serializado (129)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (TenantContext.getOrThrow as jest.Mock).mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    });
  });

  it('persiste en el activo el mismo lote que viaja al kardex', async () => {
    const manager = buildManager({
      trackingMode: InventoryTrackingMode.SERIALIZED,
      purchaseUnitOfMeasure: null,
      purchaseToBaseUomFactor: null,
    });
    const { service, stockLedgerServiceMock, serializedAssetServiceMock } = buildService(manager);

    await service.record(
      counterInput({
        lines: [{ ...counterInput().lines[0], quantityReceived: 2, serialNumbers: ['S-1', 'S-2'] }],
      }),
      actor,
    );

    const llamadas = serializedAssetServiceMock.createReceivedAssetWithManager.mock.calls;
    expect(llamadas).toHaveLength(2);

    const enKardex = stockLedgerServiceMock.recordMovementWithManager.mock.calls[0]?.[2] as {
      lines: Array<{ lotId: string }>;
    };
    for (const llamada of llamadas) {
      expect(llamada[1]).toEqual(expect.objectContaining({ lotId: enKardex.lines[0]?.lotId }));
    }
  });
});
