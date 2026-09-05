import { DataSource } from 'typeorm';
import { runInTenantSchema } from '@iwana/db';
import {
  InventoryTrackingMode,
  PurchaseOrderStatus,
  StockBalanceCondition,
  StockMovementOrigin,
  UserRole,
} from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { GoodsReceiptService } from '../services/goods-receipt.service';

jest.mock('@iwana/db', () => ({
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    }),
  },
  runInTenantSchema: jest.fn(),
  PurchaseRequest: class PurchaseRequest {},
  PurchaseRequestLine: class PurchaseRequestLine {},
  PurchaseOrder: class PurchaseOrder {},
  PurchaseOrderLine: class PurchaseOrderLine {},
  GoodsReceipt: class GoodsReceipt {},
  GoodsReceiptLine: class GoodsReceiptLine {},
  InventoryItem: class InventoryItem {},
  StockLot: class StockLot {},
  StockMovement: class StockMovement {},
  StockBalance: class StockBalance {},
}));

const db = jest.requireMock('@iwana/db') as {
  StockMovement: unknown;
  StockBalance: unknown;
  GoodsReceipt: unknown;
};

const actor: JwtPayload = {
  sub: 'support-001',
  email: 'support@example.test',
  role: UserRole.SUPPORT,
  tenantId: 'tenant-001',
  schemaName: 'tenant_001',
  jti: 'jti-f5b',
  type: 'tenant',
};

const mockRunInTenantSchema = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;

function createNumberQueryBuilder(maxValue: string | null) {
  return {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue({ maxValue }),
    getMany: jest.fn().mockResolvedValue([]),
  };
}

interface HarnessOptions {
  item?: Record<string, unknown>;
  purchaseOrderLine?: Record<string, unknown>;
}

function buildHarness(options: HarnessOptions = {}) {
  const item = {
    id: 'item-001',
    tenantId: 'tenant-001',
    trackingMode: InventoryTrackingMode.CONSUMABLE,
    unitOfMeasure: 'UNIT',
    purchaseUnitOfMeasure: 'BOX',
    purchaseToBaseUomFactor: '100',
    usefulLifeMonths: null,
    ...options.item,
  };

  const purchaseOrderLine = {
    id: 'pol-001',
    tenantId: 'tenant-001',
    purchaseOrderId: 'po-001',
    itemId: 'item-001',
    quantity: '5.00',
    receivedQuantity: '0.00',
    unitCost: '100.00',
    purchaseRequestLineId: null,
    ...options.purchaseOrderLine,
  };

  const savedEntities: unknown[] = [];
  const savedPayloads: Array<{ entity: unknown; payload: Record<string, unknown> }> = [];

  const manager = {
    transaction: jest.fn().mockImplementation(async (work) => work(manager)),
    createQueryBuilder: jest.fn().mockReturnValue(createNumberQueryBuilder('GR-000005')),
    find: jest.fn().mockResolvedValue([purchaseOrderLine]),
    findOne: jest.fn().mockImplementation(async (entity) => {
      const { InventoryItem } = jest.requireMock('@iwana/db') as {
        InventoryItem: unknown;
      };
      if (entity === InventoryItem) {
        return item;
      }
      return null;
    }),
    create: jest.fn((_entity: unknown, payload: Record<string, unknown>) => payload),
    save: jest
      .fn()
      .mockImplementation(async (entity: unknown, payload: Record<string, unknown>) => {
        savedEntities.push(entity);
        savedPayloads.push({ entity, payload });
        return {
          id:
            'receiptNumber' in payload
              ? 'gr-001'
              : 'lotNumber' in payload
                ? 'lot-001'
                : 'goodsReceiptId' in payload
                  ? 'gr-line-001'
                  : (payload.id ?? 'saved-001'),
          ...payload,
        };
      }),
  };

  const purchasingServiceMock = {
    requirePurchaseOrder: jest.fn().mockResolvedValue({
      id: 'po-001',
      tenantId: 'tenant-001',
      orderNumber: 'PO-000042',
      status: PurchaseOrderStatus.APPROVED,
    }),
  };
  const stockLedgerServiceMock = {
    recordMovementWithManager: jest.fn().mockResolvedValue({
      movement: { id: 'mov-001', origin: StockMovementOrigin.PURCHASE_RECEIPT },
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
  const inventoryCostingServiceMock = {
    applyReceiptCostingWithManager: jest.fn().mockResolvedValue(undefined),
  };
  const domainEventPublisherMock = {
    captureItemSnapshots: jest.fn().mockResolvedValue(new Map()),
    publishAfterCommittedMovement: jest.fn(),
  };

  mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));

  const service = new GoodsReceiptService(
    {} as DataSource,
    purchasingServiceMock as never,
    stockLedgerServiceMock as never,
    serializedAssetServiceMock as never,
    inventoryCostingServiceMock as never,
    domainEventPublisherMock as never,
  );

  return {
    service,
    manager,
    item,
    purchaseOrderLine,
    savedEntities,
    savedPayloads,
    stockLedgerServiceMock,
    inventoryCostingServiceMock,
  };
}

function receiveInput(overrides: Record<string, unknown> = {}) {
  return {
    destinationLocationId: 'loc-001',
    receivedAt: '2026-09-03T13:00:00.000Z',
    lines: [
      {
        purchaseOrderLineId: 'pol-001',
        itemId: 'item-001',
        quantityReceived: 2,
        quantityShortage: 0,
        quantityDamaged: 0,
        condition: StockBalanceCondition.NEW,
        serialNumbers: [],
      },
    ],
    ...overrides,
  };
}

function receiptLinePayload(harness: ReturnType<typeof buildHarness>) {
  // La línea de recepción es el payload con goodsReceiptId + purchaseOrderLineId
  // (el lote también lleva goodsReceiptId, pero sin línea de orden).
  const entry = harness.savedPayloads.find(
    (candidate) =>
      'goodsReceiptId' in candidate.payload && 'purchaseOrderLineId' in candidate.payload,
  );
  if (!entry) {
    throw new Error('No se persistió la línea de recepción.');
  }
  return entry.payload;
}

function ledgerInput(harness: ReturnType<typeof buildHarness>) {
  const call = harness.stockLedgerServiceMock.recordMovementWithManager.mock.calls[0];
  if (!call) {
    throw new Error('El ledger nunca fue invocado.');
  }
  return call[2] as { lines: Array<{ quantity: number; unitCost: number }> };
}

/**
 * Aplicación del factor en recepción (ADR-085 D3 · F5b).
 * Comportamiento real del servicio con persistencia simulada por mocks.
 */
describe('GoodsReceiptService — conversión compra → base (F5b)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('CA-F5B-01: 2 cajas × 100 registran 200 unidades en el ledger', async () => {
    const harness = buildHarness();
    await harness.service.receivePurchaseOrder('po-001', receiveInput(), actor);

    expect(ledgerInput(harness).lines).toEqual([expect.objectContaining({ quantity: 200 })]);
  });

  it('CA-F5B-02: la línea conserva la cantidad de compra (2.00) y la OC descuenta en compra', async () => {
    const harness = buildHarness();
    await harness.service.receivePurchaseOrder('po-001', receiveInput(), actor);

    const receiptLine = receiptLinePayload(harness);
    expect(receiptLine.quantityReceived).toBe('2.00');
    expect(harness.purchaseOrderLine.receivedQuantity).toBe('2.00');
  });

  it('CA-F5B-07: la conversión se aplica una sola vez', async () => {
    const harness = buildHarness();
    await harness.service.receivePurchaseOrder('po-001', receiveInput(), actor);

    // Un solo movimiento hacia el ledger…
    expect(harness.stockLedgerServiceMock.recordMovementWithManager).toHaveBeenCalledTimes(1);
    // …con la cantidad ya convertida (200, no 200×100)…
    expect(ledgerInput(harness).lines[0]?.quantity).toBe(200);
    // …mientras la línea guarda la cantidad de compra sin convertir.
    const receiptLine = receiptLinePayload(harness);
    expect(receiptLine.quantityReceived).toBe('2.00');
  });

  it('convierte factores decimales (3 × 2,5 → 7,5)', async () => {
    const harness = buildHarness({
      item: { purchaseToBaseUomFactor: '2.5' },
      purchaseOrderLine: { quantity: '10.00' },
    });
    await harness.service.receivePurchaseOrder(
      'po-001',
      receiveInput({ lines: [{ ...receiveInput().lines[0], quantityReceived: 3 }] }),
      actor,
    );

    expect(ledgerInput(harness).lines[0]?.quantity).toBe(7.5);
  });

  it('normaliza el costo a unidad base preservando el valor total (50000/caja → 500/unidad)', async () => {
    const harness = buildHarness({ purchaseOrderLine: { unitCost: '50000.00' } });
    await harness.service.receivePurchaseOrder('po-001', receiveInput(), actor);

    expect(ledgerInput(harness).lines[0]?.unitCost).toBe(500);
    expect(harness.inventoryCostingServiceMock.applyReceiptCostingWithManager).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-001',
      [expect.objectContaining({ quantity: 200, unitCost: 500 })],
    );
  });

  it('CA-F5B-06: sin unidad de compra ni factor el comportamiento es idéntico al anterior', async () => {
    const harness = buildHarness({
      item: { purchaseUnitOfMeasure: null, purchaseToBaseUomFactor: null },
    });
    await harness.service.receivePurchaseOrder('po-001', receiveInput(), actor);

    expect(ledgerInput(harness).lines).toEqual([
      expect.objectContaining({ quantity: 2, unitCost: 100 }),
    ]);
    const receiptLine = receiptLinePayload(harness);
    expect(receiptLine.quantityReceived).toBe('2.00');
  });

  it('rechaza la recepción si hay unidad de compra distinta sin factor (§4.5: nunca se asume 1)', async () => {
    const harness = buildHarness({
      item: { purchaseUnitOfMeasure: 'BOX', purchaseToBaseUomFactor: null },
    });

    await expect(
      harness.service.receivePurchaseOrder('po-001', receiveInput(), actor),
    ).rejects.toThrow(/factor de conversión válido/);
    expect(harness.stockLedgerServiceMock.recordMovementWithManager).not.toHaveBeenCalled();
  });

  it('rechaza en recepción un maestro legacy dimensionalmente inválido (metro → litro)', async () => {
    const harness = buildHarness({
      item: {
        unitOfMeasure: 'METER',
        purchaseUnitOfMeasure: 'LITER',
        purchaseToBaseUomFactor: '1',
      },
    });

    await expect(
      harness.service.receivePurchaseOrder('po-001', receiveInput(), actor),
    ).rejects.toThrow(/dimensiones distintas/);
    expect(harness.stockLedgerServiceMock.recordMovementWithManager).not.toHaveBeenCalled();
  });

  it('exige un serial por unidad base con conversión (2 cajas × 2 = 4 seriales)', async () => {
    const harness = buildHarness({
      item: {
        trackingMode: InventoryTrackingMode.SERIALIZED,
        purchaseToBaseUomFactor: '2',
      },
    });

    await expect(
      harness.service.receivePurchaseOrder(
        'po-001',
        receiveInput({
          lines: [{ ...receiveInput().lines[0], serialNumbers: ['S-1', 'S-2'] }],
        }),
        actor,
      ),
    ).rejects.toThrow(/unidad base/);

    await harness.service.receivePurchaseOrder(
      'po-001',
      receiveInput({
        lines: [{ ...receiveInput().lines[0], serialNumbers: ['S-1', 'S-2', 'S-3', 'S-4'] }],
      }),
      actor,
    );
    const input = harness.stockLedgerServiceMock.recordMovementWithManager.mock.calls[0]?.[2] as {
      lines: Array<{ quantity: number }>;
    };
    expect(input.lines).toHaveLength(4);
    expect(input.lines.every((line) => line.quantity === 1)).toBe(true);
  });

  it('CA-F5B-08: recepciones sucesivas idénticas convierten idéntico (sin deriva por encadenamiento)', async () => {
    const first = buildHarness();
    await first.service.receivePurchaseOrder('po-001', receiveInput(), actor);

    const second = buildHarness();
    await second.service.receivePurchaseOrder('po-001', receiveInput(), actor);

    const firstQty = (
      first.stockLedgerServiceMock.recordMovementWithManager.mock.calls[0]?.[2] as {
        lines: Array<{ quantity: number }>;
      }
    ).lines[0]?.quantity;
    const secondQty = (
      second.stockLedgerServiceMock.recordMovementWithManager.mock.calls[0]?.[2] as {
        lines: Array<{ quantity: number }>;
      }
    ).lines[0]?.quantity;
    expect(firstQty).toBe(200);
    expect(secondQty).toBe(200);
    expect((firstQty ?? 0) + (secondQty ?? 0)).toBe(400);
  });

  it('CA-F5B-09: no toca movimientos ni saldos históricos (solo inserta documentos nuevos)', async () => {
    const harness = buildHarness();
    await harness.service.receivePurchaseOrder('po-001', receiveInput(), actor);

    expect(
      harness.savedEntities.includes(db.StockMovement) ||
        harness.savedEntities.includes(db.StockBalance),
    ).toBe(false);
  });
});
