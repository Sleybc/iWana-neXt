import { DataSource } from 'typeorm';
import { runInTenantSchema } from '@iwana/db';
import {
  GoodsReceiptStatus,
  InventoryTrackingMode,
  PartyStatus,
  PurchaseOrderStatus,
  PurchaseRequestLineSourceKind,
  PurchaseRequestPriority,
  PurchaseRequestStatus,
  PurchaseRequestType,
  StockBalanceCondition,
  StockMovementOrigin,
  UserRole,
} from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { SupplierPartyPort } from '../ports/supplier-party.port';
import { GoodsReceiptService } from '../services/goods-receipt.service';
import { PurchasingPolicyService } from '../services/purchasing-policy.service';
import { PurchasingQueryService } from '../services/purchasing-query.service';
import { PurchasingService } from '../services/purchasing.service';
import { RfqService } from '../services/rfq.service';
import { SupplierProfileService } from '../services/supplier-profile.service';

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

describe('PurchasingPolicyService', () => {
  const service = new PurchasingPolicyService();

  it('blocks replenishment approvals without quote', () => {
    const result = service.evaluateApproval({
      requestType: PurchaseRequestType.REPLENISHMENT,
      estimatedAmount: 950000,
      hasQuote: false,
      hasException: false,
      justification: 'Reposición regular de equipos de acceso para mantener el nivel mínimo.',
    });

    expect(result).toEqual(
      expect.objectContaining({
        canApprove: false,
        requiresException: false,
        approvalLevel: 'BUYER_MANAGER',
      }),
    );
    expect(result.blockingReason).toContain('cotización');
  });

  it('allows urgent operations without quote when exception is justified', () => {
    const result = service.evaluateApproval({
      requestType: PurchaseRequestType.URGENT_OPERATION,
      estimatedAmount: 420000,
      hasQuote: false,
      hasException: true,
      exceptionReason: 'Atención de falla masiva con ventana operativa inmediata.',
      justification: 'Se requiere compra inmediata para restablecer el servicio afectado.',
    });

    expect(result).toEqual(
      expect.objectContaining({
        canApprove: true,
        requiresException: true,
        blockingReason: null,
      }),
    );
  });

  it('demands stronger justification for free purchase requests', () => {
    const result = service.evaluateApproval({
      requestType: PurchaseRequestType.FREE_PURCHASE,
      estimatedAmount: 180000,
      hasQuote: true,
      hasException: false,
      justification: 'Compra libre',
    });

    expect(result.canApprove).toBe(false);
    expect(result.blockingReason).toContain('justificación');
  });
});

describe('PurchasingService', () => {
  const supplierProfileServiceMock = {
    assertEligibleForPurchasing: jest.fn().mockResolvedValue(undefined),
  } as unknown as SupplierProfileService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a purchase request with header metadata and lines', async () => {
    const savedLines: Array<Record<string, unknown>> = [];
    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      createQueryBuilder: jest.fn().mockReturnValue(createNumberQueryBuilder('PR-000009')),
      create: jest.fn((_entity, payload) => payload),
      save: jest.fn().mockImplementation(async (_entity, payload) => {
        if ('requestNumber' in payload) {
          return { id: 'pr-001', ...payload };
        }

        if ('purchaseRequestId' in payload && 'quantityRequested' in payload) {
          const saved = { id: `line-${savedLines.length + 1}`, ...payload };
          savedLines.push(saved);
          return saved;
        }

        return { id: 'entity-001', ...payload };
      }),
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));
    const service = new PurchasingService(
      {} as DataSource,
      new PurchasingPolicyService(),
      {
        applyQuoteToInvitation: jest.fn(),
      } as unknown as RfqService,
      supplierProfileServiceMock,
    );

    const result = await service.createPurchaseRequest(
      {
        title: 'Compra híbrida de reposición',
        requestType: PurchaseRequestType.REPLENISHMENT,
        priority: PurchaseRequestPriority.HIGH,
        requestingArea: 'Operaciones de red',
        justification: 'Necesidad de reposición preventiva para evitar quiebres de stock.',
        operationalRefType: 'EXECUTION_ORDER',
        operationalRefId: 'eo-001',
        neededByDate: '2026-07-01',
        notes: 'Crear con dos líneas de trabajo.',
        lines: [
          {
            sourceKind: PurchaseRequestLineSourceKind.INVENTORY_ITEM,
            inventoryItemId: 'item-001',
            quantityRequested: 3,
            unitOfMeasure: 'unidad',
            suggestedPartyRefId: 'party-001',
          },
          {
            sourceKind: PurchaseRequestLineSourceKind.FREE_TEXT,
            freeTextDescription: 'Cable drop de contingencia',
            quantityRequested: 50,
            unitOfMeasure: 'metro',
            notes: 'Uso extraordinario',
          },
        ],
      },
      actor,
    );

    expect(result.requestNumber).toBe('PR-000010');
    expect(result.status).toBe(PurchaseRequestStatus.PENDING_QUOTES);
    expect(savedLines).toHaveLength(2);
    expect(savedLines[0]).toEqual(
      expect.objectContaining({
        purchaseRequestId: 'pr-001',
        inventoryItemId: 'item-001',
        sourceKind: PurchaseRequestLineSourceKind.INVENTORY_ITEM,
      }),
    );
    expect(savedLines[1]).toEqual(
      expect.objectContaining({
        freeTextDescription: 'Cable drop de contingencia',
        sourceKind: PurchaseRequestLineSourceKind.FREE_TEXT,
      }),
    );
  });

  it('blocks approval when the policy requires quote evidence', async () => {
    const requestRecord = {
      id: 'pr-001',
      tenantId: 'tenant-001',
      title: 'Reposición ONT',
      status: PurchaseRequestStatus.PENDING_QUOTES,
      requestType: PurchaseRequestType.REPLENISHMENT,
      justification: 'Reposición de equipos dañados.',
      exceptionReason: null,
      notes: null,
      requestedByUserId: actor.sub,
    };
    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      findOne: jest.fn().mockResolvedValue(requestRecord),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn(),
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));
    const service = new PurchasingService(
      {} as DataSource,
      new PurchasingPolicyService(),
      {
        applyQuoteToInvitation: jest.fn(),
      } as unknown as RfqService,
      supplierProfileServiceMock,
    );

    await expect(service.approvePurchaseRequest('pr-001', {}, actor)).rejects.toThrow('cotización');
  });

  it('approves urgent operations with justified exception', async () => {
    const requestRecord = {
      id: 'pr-001',
      tenantId: 'tenant-001',
      title: 'Compra urgente de fuente de poder',
      status: PurchaseRequestStatus.PENDING_QUOTES,
      requestType: PurchaseRequestType.URGENT_OPERATION,
      justification: 'Se requiere reposición inmediata para restablecer un nodo crítico.',
      exceptionReason: null,
      notes: null,
      requestedByUserId: actor.sub,
    };
    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      findOne: jest.fn().mockResolvedValue(requestRecord),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation(async (_entity, payload) => payload),
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));
    const service = new PurchasingService(
      {} as DataSource,
      new PurchasingPolicyService(),
      {
        applyQuoteToInvitation: jest.fn(),
      } as unknown as RfqService,
      supplierProfileServiceMock,
    );

    const result = await service.approvePurchaseRequest(
      'pr-001',
      {
        notes: 'Se autoriza por contingencia.',
        exceptionReason: 'Servicio degradado; no hay tiempo operativo para esperar cotización.',
      },
      actor,
    );

    expect(result.status).toBe(PurchaseRequestStatus.APPROVED);
    expect(result.approvedByUserId).toBe(actor.sub);
    expect(result.exceptionReason).toContain('Servicio degradado');
  });

  it('creates multiple purchase orders from awarded request lines', async () => {
    const requestRecord = {
      id: 'pr-001',
      tenantId: 'tenant-001',
      status: PurchaseRequestStatus.APPROVED,
    };
    const awardLineOne = {
      id: 'line-001',
      tenantId: 'tenant-001',
      purchaseRequestId: 'pr-001',
      inventoryItemId: 'item-001',
      quantityRequested: '2.00',
    };
    const awardLineTwo = {
      id: 'line-002',
      tenantId: 'tenant-001',
      purchaseRequestId: 'pr-001',
      inventoryItemId: 'item-002',
      quantityRequested: '1.00',
    };
    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      findOne: jest.fn().mockImplementation(async (_entity, options) => {
        if (options?.where?.id === 'pr-001') {
          return requestRecord;
        }
        if (options?.where?.id === 'line-001') {
          return awardLineOne;
        }
        if (options?.where?.id === 'line-002') {
          return awardLineTwo;
        }
        return null;
      }),
      find: jest.fn().mockImplementation(async (_entity, options) => {
        if (options?.where?.purchaseRequestLineId === 'line-001') {
          return [
            {
              id: 'award-001',
              tenantId: 'tenant-001',
              purchaseRequestLineId: 'line-001',
              awardedPartyRefId: 'party-001',
              awardedQuantity: '2.00',
            },
          ];
        }

        if (options?.where?.purchaseRequestLineId === 'line-002') {
          return [
            {
              id: 'award-002',
              tenantId: 'tenant-001',
              purchaseRequestLineId: 'line-002',
              awardedPartyRefId: 'party-002',
              awardedQuantity: '1.00',
            },
          ];
        }

        return [];
      }),
      createQueryBuilder: jest
        .fn()
        .mockReturnValueOnce(createNumberQueryBuilder('PO-000041'))
        .mockReturnValueOnce(createNumberQueryBuilder('PO-000042')),
      create: jest.fn((_entity, payload) => payload),
      save: jest.fn().mockImplementation(async (_entity, payload) => ({
        id:
          'orderNumber' in payload
            ? payload.orderNumber === 'PO-000042'
              ? 'po-001'
              : 'po-002'
            : 'purchaseOrderId' in payload
              ? `${payload.purchaseOrderId}-line`
              : (payload.id ?? 'entity-001'),
        ...payload,
      })),
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));
    const service = new PurchasingService(
      {} as DataSource,
      new PurchasingPolicyService(),
      {
        applyQuoteToInvitation: jest.fn(),
      } as unknown as RfqService,
      supplierProfileServiceMock,
    );

    const result = await service.createPurchaseOrderFromRequest(
      {
        purchaseRequestId: 'pr-001',
        status: PurchaseOrderStatus.APPROVED,
        orders: [
          {
            partyRefId: 'party-001',
            lines: [
              {
                purchaseRequestLineId: 'line-001',
                itemId: 'item-001',
                quantity: 2,
                unitCost: 100,
              },
            ],
          },
          {
            partyRefId: 'party-002',
            lines: [
              {
                purchaseRequestLineId: 'line-002',
                itemId: 'item-002',
                quantity: 1,
                unitCost: 250,
              },
            ],
          },
        ],
      },
      actor,
    );

    expect('orders' in result).toBe(true);
    if (!('orders' in result)) {
      throw new Error('Se esperaba una respuesta batch de órdenes.');
    }

    expect(result.orders).toHaveLength(2);
    expect(result.orders.map((order: { orderNumber: string }) => order.orderNumber)).toEqual([
      'PO-000042',
      'PO-000043',
    ]);
  });
});

describe('PurchasingQueryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns request detail with lines, quotes and awards', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'pr-001',
        tenantId: 'tenant-001',
        requestNumber: 'PR-000010',
      }),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      }),
      find: jest
        .fn()
        .mockResolvedValueOnce([
          {
            id: 'line-001',
            tenantId: 'tenant-001',
            purchaseRequestId: 'pr-001',
            inventoryItemId: 'item-001',
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'quote-001',
            tenantId: 'tenant-001',
            purchaseRequestId: 'pr-001',
            partyRefId: 'party-001',
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'award-001',
            tenantId: 'tenant-001',
            purchaseRequestLineId: 'line-001',
            awardedPartyRefId: 'party-001',
          },
        ])
        .mockResolvedValueOnce([]),
    };
    const supplierPartyPort: jest.Mocked<SupplierPartyPort> = {
      getSupplierSummary: jest.fn(),
      searchSuppliers: jest.fn(),
    } as never;

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));
    const service = new PurchasingQueryService(
      {} as DataSource,
      supplierPartyPort,
      new PurchasingPolicyService(),
    );

    const result = await service.getRequestDetail('pr-001');

    expect(result.request.id).toBe('pr-001');
    expect(result.lines).toHaveLength(1);
    expect(result.quotes).toHaveLength(1);
    expect(result.awards).toHaveLength(1);
    expect(result.rfq).toBeNull();
  });

  it('returns provider summary through the supplier port', async () => {
    const supplierPartyPort: jest.Mocked<SupplierPartyPort> = {
      getSupplierSummary: jest.fn().mockResolvedValue({
        partyRefId: 'party-001',
        displayName: 'Proveedor Norte',
        primaryContact: 'Mesa comercial',
        phone: '3000000000',
        email: 'compras@proveedor.test',
        city: 'Bogotá',
        status: PartyStatus.ACTIVE,
      }),
      searchSuppliers: jest.fn(),
    } as never;

    const service = new PurchasingQueryService(
      {} as DataSource,
      supplierPartyPort,
      new PurchasingPolicyService(),
    );

    const result = await service.getProviderSummary('party-001');

    expect(result.displayName).toBe('Proveedor Norte');
    expect(supplierPartyPort.getSupplierSummary).toHaveBeenCalledWith('party-001');
  });

  it('searches suppliers through the supplier port', async () => {
    const supplierPartyPort: jest.Mocked<SupplierPartyPort> = {
      getSupplierSummary: jest.fn(),
      searchSuppliers: jest.fn().mockResolvedValue({
        data: [
          {
            partyRefId: 'party-001',
            displayName: 'Proveedor Norte',
            status: PartyStatus.ACTIVE,
          },
        ],
        total: 1,
        page: 2,
        limit: 20,
      }),
    } as never;

    const service = new PurchasingQueryService(
      {} as DataSource,
      supplierPartyPort,
      new PurchasingPolicyService(),
    );

    const result = await service.searchSuppliers({ search: 'norte', page: 2 });

    expect(result).toEqual(
      expect.objectContaining({
        total: 1,
        page: 2,
        limit: 20,
      }),
    );
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        partyRefId: 'party-001',
        displayName: 'Proveedor Norte',
      }),
    );
    expect(supplierPartyPort.searchSuppliers).toHaveBeenCalledWith('norte', 2);
  });
});

describe('GoodsReceiptService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('records only received quantities and flags shortages', async () => {
    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      createQueryBuilder: jest.fn().mockReturnValue(createNumberQueryBuilder('GR-000005')),
      find: jest.fn().mockResolvedValue([
        {
          id: 'pol-001',
          tenantId: 'tenant-001',
          purchaseOrderId: 'po-001',
          itemId: 'item-001',
          quantity: '5.00',
          receivedQuantity: '0.00',
          unitCost: '100.00',
        },
      ]),
      findOne: jest.fn().mockResolvedValue({
        id: 'item-001',
        tenantId: 'tenant-001',
        trackingMode: InventoryTrackingMode.CONSUMABLE,
        usefulLifeMonths: null,
      }),
      create: jest.fn((_entity, payload) => payload),
      save: jest.fn().mockImplementation(async (_entity, payload) => ({
        id:
          'receiptNumber' in payload
            ? 'gr-001'
            : 'lotNumber' in payload
              ? 'lot-001'
              : 'goodsReceiptId' in payload
                ? 'gr-line-001'
                : (payload.id ?? 'saved-001'),
        ...payload,
      })),
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
      }),
    };
    const serializedAssetServiceMock = {
      normalizeSerial: jest.fn((serial: string) => serial.trim().toUpperCase()),
      createReceivedAssetWithManager: jest.fn(),
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));
    const service = new GoodsReceiptService(
      {} as DataSource,
      purchasingServiceMock as never,
      stockLedgerServiceMock as never,
      serializedAssetServiceMock as never,
    );

    const result = await service.receivePurchaseOrder(
      'po-001',
      {
        destinationLocationId: 'loc-001',
        receivedAt: '2026-06-25T13:00:00.000Z',
        lines: [
          {
            purchaseOrderLineId: 'pol-001',
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

    expect(result.receipt.receiptNumber).toBe('GR-000006');
    expect(result.receipt.status).toBe(GoodsReceiptStatus.WITH_SHORTAGES);
    expect(stockLedgerServiceMock.recordMovementWithManager).toHaveBeenCalledWith(
      manager,
      'tenant-001',
      expect.objectContaining({
        origin: StockMovementOrigin.PURCHASE_RECEIPT,
        lines: [expect.objectContaining({ quantity: 3 })],
      }),
      actor,
    );
  });

  it('rejects duplicate serials on receipt', async () => {
    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      createQueryBuilder: jest.fn().mockReturnValue(createNumberQueryBuilder(null)),
      find: jest.fn().mockResolvedValue([
        {
          id: 'pol-001',
          tenantId: 'tenant-001',
          purchaseOrderId: 'po-001',
          itemId: 'item-001',
          quantity: '2.00',
          receivedQuantity: '0.00',
          unitCost: '100.00',
        },
      ]),
      findOne: jest.fn().mockResolvedValue({
        id: 'item-001',
        tenantId: 'tenant-001',
        trackingMode: InventoryTrackingMode.SERIALIZED,
        usefulLifeMonths: 24,
      }),
      create: jest.fn((_entity, payload) => payload),
      save: jest.fn().mockImplementation(async (_entity, payload) => payload),
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
      recordMovementWithManager: jest.fn(),
    };
    const serializedAssetServiceMock = {
      normalizeSerial: jest.fn((serial: string) => serial.trim().toUpperCase()),
      createReceivedAssetWithManager: jest.fn(),
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));
    const service = new GoodsReceiptService(
      {} as DataSource,
      purchasingServiceMock as never,
      stockLedgerServiceMock as never,
      serializedAssetServiceMock as never,
    );

    await expect(
      service.receivePurchaseOrder(
        'po-001',
        {
          destinationLocationId: 'loc-001',
          status: GoodsReceiptStatus.COMPLETED,
          lines: [
            {
              purchaseOrderLineId: 'pol-001',
              itemId: 'item-001',
              quantityReceived: 2,
              quantityShortage: 0,
              quantityDamaged: 0,
              condition: StockBalanceCondition.NEW,
              serialNumbers: ['dup-001', ' DUP-001 '],
            },
          ],
        },
        actor,
      ),
    ).rejects.toThrow('está repetido en la recepción');
    expect(stockLedgerServiceMock.recordMovementWithManager).not.toHaveBeenCalled();
  });
});
