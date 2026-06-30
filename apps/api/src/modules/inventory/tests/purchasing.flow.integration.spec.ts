import { DataSource } from 'typeorm';
import { runInTenantSchema } from '@iwana/db';
import {
  GoodsReceiptStatus,
  InventoryTrackingMode,
  PurchaseOrderStatus,
  PurchaseRequestLineSourceKind,
  PurchaseRequestLineStatus,
  PurchaseRequestPriority,
  PurchaseRequestStatus,
  PurchaseRequestType,
  StockBalanceCondition,
  StockMovementOrigin,
  UserRole,
} from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { GoodsReceiptService } from '../services/goods-receipt.service';
import { PurchasingPolicyService } from '../services/purchasing-policy.service';
import { PurchasingService } from '../services/purchasing.service';

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
  PurchaseRequestLineAward: class PurchaseRequestLineAward {},
  SupplierQuote: class SupplierQuote {},
  PurchaseOrder: class PurchaseOrder {},
  PurchaseOrderLine: class PurchaseOrderLine {},
  GoodsReceipt: class GoodsReceipt {},
  GoodsReceiptLine: class GoodsReceiptLine {},
  InventoryItem: class InventoryItem {},
  StockLot: class StockLot {},
}));

describe('Purchasing flow integration (tenant-aware mock)', () => {
  const actor: JwtPayload = {
    sub: 'support-001',
    email: 'support@example.test',
    role: UserRole.SUPPORT,
    tenantId: 'tenant-001',
    schemaName: 'tenant_001',
    jti: 'jti-001',
    type: 'tenant',
  };

  const mockRunInTenantSchema = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;

  const state = {
    requests: [] as Array<Record<string, unknown>>,
    requestLines: [] as Array<Record<string, unknown>>,
    quotes: [] as Array<Record<string, unknown>>,
    awards: [] as Array<Record<string, unknown>>,
    orders: [] as Array<Record<string, unknown>>,
    orderLines: [] as Array<Record<string, unknown>>,
    receipts: [] as Array<Record<string, unknown>>,
    receiptLines: [] as Array<Record<string, unknown>>,
    lots: [] as Array<Record<string, unknown>>,
    inventoryItems: [
      {
        id: 'item-001',
        tenantId: 'tenant-001',
        trackingMode: InventoryTrackingMode.CONSUMABLE,
        usefulLifeMonths: null,
      },
      {
        id: 'item-002',
        tenantId: 'tenant-001',
        trackingMode: InventoryTrackingMode.CONSUMABLE,
        usefulLifeMonths: null,
      },
    ] as Array<Record<string, unknown>>,
  };

  function createManager() {
    return {
      transaction: jest
        .fn()
        .mockImplementation(async (work: (m: unknown) => Promise<unknown>) =>
          work(createManager()),
        ),
      createQueryBuilder: jest.fn().mockImplementation((_entity, alias) => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          maxValue:
            alias === 'request'
              ? (state.requests[state.requests.length - 1]?.requestNumber ?? null)
              : alias === 'purchaseOrder'
                ? (state.orders[state.orders.length - 1]?.orderNumber ?? null)
                : alias === 'receipt'
                  ? (state.receipts[state.receipts.length - 1]?.receiptNumber ?? null)
                  : null,
        }),
        getMany: jest.fn().mockImplementation(async () => {
          if (alias === 'request') {
            return [...state.requests];
          }
          if (alias === 'purchaseOrder') {
            return [...state.orders];
          }
          return [];
        }),
      })),
      create: jest.fn((_entity, payload) => payload),
      save: jest.fn().mockImplementation(async (_entity, payload) => {
        if (payload.requestNumber) {
          const existingIndex = state.requests.findIndex((entry) => entry.id === payload.id);
          if (existingIndex >= 0) {
            state.requests[existingIndex] = { ...state.requests[existingIndex], ...payload };
            return state.requests[existingIndex];
          }

          const saved = { id: `pr-${state.requests.length + 1}`, ...payload };
          state.requests.push(saved);
          return saved;
        }

        if (payload.purchaseRequestId && payload.quantityRequested) {
          const existingIndex = state.requestLines.findIndex((entry) => entry.id === payload.id);
          if (existingIndex >= 0) {
            state.requestLines[existingIndex] = {
              ...state.requestLines[existingIndex],
              ...payload,
            };
            return state.requestLines[existingIndex];
          }

          const saved = { id: `line-${state.requestLines.length + 1}`, ...payload };
          state.requestLines.push(saved);
          return saved;
        }

        if (payload.quoteNumber) {
          const saved = { id: `quote-${state.quotes.length + 1}`, ...payload };
          state.quotes.push(saved);
          return saved;
        }

        if (payload.purchaseRequestLineId && payload.awardedPartyRefId) {
          const saved = { id: `award-${state.awards.length + 1}`, ...payload };
          state.awards.push(saved);
          return saved;
        }

        if (payload.orderNumber) {
          const existingIndex = state.orders.findIndex((entry) => entry.id === payload.id);
          if (existingIndex >= 0) {
            state.orders[existingIndex] = { ...state.orders[existingIndex], ...payload };
            return state.orders[existingIndex];
          }

          const saved = { id: `po-${state.orders.length + 1}`, ...payload };
          state.orders.push(saved);
          return saved;
        }

        if (payload.purchaseOrderId && payload.itemId && payload.unitCost) {
          const existingIndex = state.orderLines.findIndex((entry) => entry.id === payload.id);
          if (existingIndex >= 0) {
            state.orderLines[existingIndex] = { ...state.orderLines[existingIndex], ...payload };
            return state.orderLines[existingIndex];
          }

          const saved = { id: `pol-${state.orderLines.length + 1}`, ...payload };
          state.orderLines.push(saved);
          return saved;
        }

        if (payload.receiptNumber) {
          const existingIndex = state.receipts.findIndex((entry) => entry.id === payload.id);
          if (existingIndex >= 0) {
            state.receipts[existingIndex] = { ...state.receipts[existingIndex], ...payload };
            return state.receipts[existingIndex];
          }

          const saved = { id: `gr-${state.receipts.length + 1}`, ...payload };
          state.receipts.push(saved);
          return saved;
        }

        if (payload.goodsReceiptId && payload.purchaseOrderLineId) {
          const saved = { id: `gr-line-${state.receiptLines.length + 1}`, ...payload };
          state.receiptLines.push(saved);
          return saved;
        }

        if (payload.lotNumber) {
          const saved = { id: `lot-${state.lots.length + 1}`, ...payload };
          state.lots.push(saved);
          return saved;
        }

        return payload;
      }),
      findOne: jest.fn().mockImplementation(async (entity, options) => {
        const id = options?.where?.id;

        if (entity?.name === 'PurchaseRequestLine') {
          return state.requestLines.find((entry) => entry.id === id) ?? null;
        }

        if (entity?.name === 'InventoryItem') {
          return state.inventoryItems.find((entry) => entry.id === id) ?? null;
        }

        return (
          state.requests.find((entry) => entry.id === id) ??
          state.orders.find((entry) => entry.id === id) ??
          null
        );
      }),
      find: jest.fn().mockImplementation(async (entity, options) => {
        if (entity?.name === 'SupplierQuote' && options?.where?.purchaseRequestId) {
          return state.quotes.filter(
            (quote) => quote.purchaseRequestId === options.where.purchaseRequestId,
          );
        }

        if (entity?.name === 'PurchaseRequestLineAward' && options?.where?.purchaseRequestLineId) {
          return state.awards.filter(
            (award) => award.purchaseRequestLineId === options.where.purchaseRequestLineId,
          );
        }

        if (entity?.name === 'PurchaseOrderLine' && options?.where?.purchaseOrderId) {
          return state.orderLines.filter(
            (line) => line.purchaseOrderId === options.where.purchaseOrderId,
          );
        }

        return [];
      }),
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    state.requests = [];
    state.requestLines = [];
    state.quotes = [];
    state.awards = [];
    state.orders = [];
    state.orderLines = [];
    state.receipts = [];
    state.receiptLines = [];
    state.lots = [];
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
      fn({ manager: createManager() } as never),
    );
  });

  it('supports awards, multiple purchase orders and partial receipts without overstating stock', async () => {
    const policyService = new PurchasingPolicyService();
    const purchasingService = new PurchasingService({} as DataSource, policyService);
    const stockLedgerServiceMock = {
      recordMovementWithManager: jest.fn().mockResolvedValue({
        movement: { id: 'mov-001', origin: StockMovementOrigin.PURCHASE_RECEIPT },
        lines: [{ id: 'mov-line-001' }],
      }),
    };
    const serializedAssetServiceMock = {
      normalizeSerial: jest.fn((serial: string) => serial),
      createReceivedAssetWithManager: jest.fn(),
    };
    const goodsReceiptService = new GoodsReceiptService(
      {} as DataSource,
      purchasingService,
      stockLedgerServiceMock as never,
      serializedAssetServiceMock as never,
    );

    const createdRequest = await purchasingService.createPurchaseRequest(
      {
        title: 'Compra de proyecto despliegue',
        requestType: PurchaseRequestType.PROJECT,
        priority: PurchaseRequestPriority.HIGH,
        requestingArea: 'Operaciones',
        justification: 'Proyecto de despliegue con abastecimiento separado por proveedor.',
        neededByDate: '2026-07-01',
        lines: [
          {
            sourceKind: PurchaseRequestLineSourceKind.INVENTORY_ITEM,
            inventoryItemId: 'item-001',
            quantityRequested: 5,
            unitOfMeasure: 'unidad',
          },
          {
            sourceKind: PurchaseRequestLineSourceKind.INVENTORY_ITEM,
            inventoryItemId: 'item-002',
            quantityRequested: 2,
            unitOfMeasure: 'unidad',
          },
        ],
      },
      actor,
    );

    expect(createdRequest.status).toBe(PurchaseRequestStatus.PENDING_QUOTES);
    expect(state.requestLines).toHaveLength(2);

    await purchasingService.addSupplierQuote(
      createdRequest.id as string,
      {
        partyRefId: 'party-001',
        quoteNumber: 'Q-001',
        amount: 900000,
        currency: 'cop',
      },
      actor,
    );

    const approvedRequest = await purchasingService.approvePurchaseRequest(
      createdRequest.id as string,
      { notes: 'Proyecto aprobado para compra.' },
      actor,
    );
    expect(approvedRequest.status).toBe(PurchaseRequestStatus.APPROVED);

    const lineOneId = state.requestLines[0]?.id as string;
    const lineTwoId = state.requestLines[1]?.id as string;

    const awards = await purchasingService.createLineAwards(
      createdRequest.id as string,
      {
        awards: [
          {
            purchaseRequestLineId: lineOneId,
            awardedPartyRefId: 'party-001',
            awardedQuantity: 5,
          },
          {
            purchaseRequestLineId: lineTwoId,
            awardedPartyRefId: 'party-002',
            awardedQuantity: 2,
          },
        ],
      },
      actor,
    );

    expect(awards).toHaveLength(2);
    expect(state.awards).toHaveLength(2);

    const orderResult = await purchasingService.createPurchaseOrderFromRequest(
      {
        purchaseRequestId: createdRequest.id as string,
        status: PurchaseOrderStatus.APPROVED,
        orders: [
          {
            partyRefId: 'party-001',
            lines: [
              {
                purchaseRequestLineId: lineOneId,
                itemId: 'item-001',
                quantity: 5,
                unitCost: 100000,
              },
            ],
          },
          {
            partyRefId: 'party-002',
            lines: [
              {
                purchaseRequestLineId: lineTwoId,
                itemId: 'item-002',
                quantity: 2,
                unitCost: 120000,
              },
            ],
          },
        ],
      },
      actor,
    );

    expect('orders' in orderResult).toBe(true);
    if (!('orders' in orderResult)) {
      throw new Error('Se esperaba una respuesta batch con órdenes.');
    }

    expect(orderResult.orders).toHaveLength(2);
    expect(state.orderLines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ purchaseRequestLineId: lineOneId }),
        expect.objectContaining({ purchaseRequestLineId: lineTwoId }),
      ]),
    );

    const firstOrderLine = state.orderLines.find(
      (line) => line.purchaseRequestLineId === lineOneId,
    );
    const receiptResult = await goodsReceiptService.receivePurchaseOrder(
      orderResult.orders[0]?.id as string,
      {
        destinationLocationId: 'loc-001',
        lines: [
          {
            purchaseOrderLineId: firstOrderLine?.id as string,
            itemId: 'item-001',
            quantityReceived: 3,
            quantityShortage: 2,
            quantityDamaged: 0,
            condition: StockBalanceCondition.NEW,
            serialNumbers: [],
          },
        ],
      },
      actor,
    );

    expect(receiptResult.receipt.status).toBe(GoodsReceiptStatus.WITH_SHORTAGES);
    expect(stockLedgerServiceMock.recordMovementWithManager).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-001',
      expect.objectContaining({
        origin: StockMovementOrigin.PURCHASE_RECEIPT,
        lines: [expect.objectContaining({ quantity: 3 })],
      }),
      actor,
    );
    expect(state.orderLines.find((line) => line.id === firstOrderLine?.id)?.receivedQuantity).toBe(
      '3.00',
    );
    expect(state.orders.find((order) => order.id === orderResult.orders[0]?.id)?.status).toBe(
      PurchaseOrderStatus.PARTIALLY_RECEIVED,
    );
    expect(state.requestLines.find((line) => line.id === lineOneId)?.lineStatus).toBe(
      PurchaseRequestLineStatus.PARTIALLY_RECEIVED,
    );
  });
});
