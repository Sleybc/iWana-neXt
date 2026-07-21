import { DataSource } from 'typeorm';
import { runInTenantSchema } from '@iwana/db';
import {
  GoodsReceiptStatus,
  InventoryTrackingMode,
  PartyStatus,
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
  PurchaseRfq: class PurchaseRfq {},
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
    expect(result.status).toBe(PurchaseRequestStatus.DRAFT);
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

  it('rejects line awards when the purchase request is not approved', async () => {
    const requestRecord = {
      id: 'pr-001',
      tenantId: 'tenant-001',
      status: PurchaseRequestStatus.PENDING_APPROVAL,
      requestType: PurchaseRequestType.REPLENISHMENT,
    };
    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      findOne: jest.fn().mockResolvedValue(requestRecord),
      find: jest.fn(),
      save: jest.fn(),
      create: jest.fn((_entity, payload) => payload),
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

    await expect(
      service.createLineAwards(
        'pr-001',
        {
          awards: [
            {
              purchaseRequestLineId: 'line-001',
              awardedPartyRefId: 'party-001',
              awardedQuantity: 1,
            },
          ],
        },
        actor,
      ),
    ).rejects.toThrow('aprobada');
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('creates line awards when the purchase request is approved', async () => {
    const requestRecord = {
      id: 'pr-001',
      tenantId: 'tenant-001',
      status: PurchaseRequestStatus.APPROVED,
      requestType: PurchaseRequestType.REPLENISHMENT,
    };
    const line = {
      id: 'line-001',
      tenantId: 'tenant-001',
      purchaseRequestId: 'pr-001',
      quantityRequested: '2.00',
      lineStatus: PurchaseRequestLineStatus.OPEN,
    };
    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      findOne: jest.fn().mockImplementation(async (_entity, options) => {
        if (options?.where?.id === 'pr-001') {
          return requestRecord;
        }
        if (options?.where?.id === 'line-001') {
          return line;
        }
        return null;
      }),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((_entity, payload) => payload),
      save: jest.fn().mockImplementation(async (_entity, payload) => ({
        id: payload.id ?? 'award-001',
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

    const result = await service.createLineAwards(
      'pr-001',
      {
        awards: [
          {
            purchaseRequestLineId: 'line-001',
            awardedPartyRefId: 'party-001',
            awardedQuantity: 2,
            supplierQuoteId: 'quote-001',
          },
        ],
      },
      actor,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        purchaseRequestLineId: 'line-001',
        awardedPartyRefId: 'party-001',
        supplierQuoteId: 'quote-001',
      }),
    );
    expect(line.lineStatus).toBe(PurchaseRequestLineStatus.AWARDED);
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

  it('rejects from PENDING_QUOTES, persists reason/actor, cancels RFQ and rejects open lines', async () => {
    const requestRecord = {
      id: 'pr-001',
      tenantId: 'tenant-001',
      status: PurchaseRequestStatus.PENDING_QUOTES,
      resolutionReason: null as string | null,
      resolvedByUserId: null as string | null,
    };
    const openLine = {
      id: 'line-open',
      tenantId: 'tenant-001',
      purchaseRequestId: 'pr-001',
      lineStatus: PurchaseRequestLineStatus.PENDING_QUOTE,
    };
    const orderedLine = {
      id: 'line-ordered',
      tenantId: 'tenant-001',
      purchaseRequestId: 'pr-001',
      lineStatus: PurchaseRequestLineStatus.ORDERED,
    };
    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      findOne: jest.fn().mockResolvedValue(requestRecord),
      find: jest.fn().mockResolvedValue([openLine, orderedLine]),
      save: jest.fn().mockImplementation(async (_entity, payload) => payload),
    };
    const cancelActiveForRequest = jest.fn().mockResolvedValue(undefined);

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));
    const service = new PurchasingService(
      {} as DataSource,
      new PurchasingPolicyService(),
      { applyQuoteToInvitation: jest.fn(), cancelActiveForRequest } as unknown as RfqService,
      supplierProfileServiceMock,
    );

    const result = await service.rejectPurchaseRequest(
      'pr-001',
      { reason: 'Cotizaciones fuera de presupuesto operativo' },
      actor,
    );

    expect(result.status).toBe(PurchaseRequestStatus.REJECTED);
    expect(result.resolutionReason).toBe('Cotizaciones fuera de presupuesto operativo');
    expect(result.resolvedByUserId).toBe(actor.sub);
    expect(cancelActiveForRequest).toHaveBeenCalledWith(manager, 'tenant-001', 'pr-001', actor);
    expect(openLine.lineStatus).toBe(PurchaseRequestLineStatus.REJECTED);
    expect(orderedLine.lineStatus).toBe(PurchaseRequestLineStatus.ORDERED);
    expect(manager.save).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'line-open', lineStatus: PurchaseRequestLineStatus.REJECTED }),
    );
    expect(manager.save).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'line-ordered' }),
    );
  });

  it('cancels from APPROVED and marks lines cancelled', async () => {
    const requestRecord = {
      id: 'pr-002',
      tenantId: 'tenant-001',
      status: PurchaseRequestStatus.APPROVED,
      resolutionReason: null as string | null,
      resolvedByUserId: null as string | null,
    };
    const awardedLine = {
      id: 'line-awarded',
      tenantId: 'tenant-001',
      purchaseRequestId: 'pr-002',
      lineStatus: PurchaseRequestLineStatus.AWARDED,
    };
    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      findOne: jest.fn().mockResolvedValue(requestRecord),
      find: jest.fn().mockResolvedValue([awardedLine]),
      save: jest.fn().mockImplementation(async (_entity, payload) => payload),
    };
    const cancelActiveForRequest = jest.fn().mockResolvedValue(undefined);

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));
    const service = new PurchasingService(
      {} as DataSource,
      new PurchasingPolicyService(),
      { applyQuoteToInvitation: jest.fn(), cancelActiveForRequest } as unknown as RfqService,
      supplierProfileServiceMock,
    );

    const result = await service.cancelPurchaseRequest(
      'pr-002',
      { reason: 'Proyecto suspendido' },
      actor,
    );

    expect(result.status).toBe(PurchaseRequestStatus.CANCELLED);
    expect(result.resolutionReason).toBe('Proyecto suspendido');
    expect(result.resolvedByUserId).toBe(actor.sub);
    expect(awardedLine.lineStatus).toBe(PurchaseRequestLineStatus.CANCELLED);
    expect(cancelActiveForRequest).toHaveBeenCalled();
  });

  it('rejects cancel from CONVERTED_TO_PO with Spanish BadRequest', async () => {
    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      findOne: jest.fn().mockResolvedValue({
        id: 'pr-003',
        tenantId: 'tenant-001',
        status: PurchaseRequestStatus.CONVERTED_TO_PO,
      }),
      find: jest.fn(),
      save: jest.fn(),
    };
    const cancelActiveForRequest = jest.fn();

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));
    const service = new PurchasingService(
      {} as DataSource,
      new PurchasingPolicyService(),
      { applyQuoteToInvitation: jest.fn(), cancelActiveForRequest } as unknown as RfqService,
      supplierProfileServiceMock,
    );

    await expect(
      service.cancelPurchaseRequest('pr-003', { reason: 'Ya no aplica' }, actor),
    ).rejects.toThrow('La solicitud no está en un estado que permita cancelarla.');
    expect(cancelActiveForRequest).not.toHaveBeenCalled();
  });

  it('updates request header and replaces lines when in DRAFT with no quotes', async () => {
    const requestRecord = {
      id: 'pr-edit-001',
      tenantId: 'tenant-001',
      title: 'Título original',
      status: PurchaseRequestStatus.DRAFT,
      priority: PurchaseRequestPriority.NORMAL,
      requestingArea: 'Logística',
      justification: null,
      neededByDate: null,
      notes: null,
      updatedAt: new Date(),
    };
    const savedLines: Array<Record<string, unknown>> = [];
    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      findOne: jest.fn().mockResolvedValue(requestRecord),
      count: jest.fn().mockResolvedValue(0),
      find: jest.fn().mockResolvedValue([]),
      remove: jest.fn().mockResolvedValue(undefined),
      create: jest.fn((_entity, payload) => payload),
      save: jest.fn().mockImplementation(async (_entity, payload) => {
        if ('purchaseRequestId' in payload && 'quantityRequested' in payload) {
          const saved = { id: `line-${savedLines.length + 1}`, ...payload };
          savedLines.push(saved);
          return saved;
        }
        return { ...payload };
      }),
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));
    const service = new PurchasingService(
      {} as DataSource,
      new PurchasingPolicyService(),
      { applyQuoteToInvitation: jest.fn() } as unknown as RfqService,
      supplierProfileServiceMock,
    );

    const result = await service.updatePurchaseRequest(
      'pr-edit-001',
      {
        title: 'Título actualizado',
        priority: PurchaseRequestPriority.HIGH,
        lines: [
          {
            sourceKind: PurchaseRequestLineSourceKind.INVENTORY_ITEM,
            inventoryItemId: 'item-001',
            freeTextDescription: 'Cable de fibra',
            quantityRequested: 5,
            unitOfMeasure: 'metro',
          },
        ],
      },
      actor,
    );

    expect(result.title).toBe('Título actualizado');
    expect(result.priority).toBe(PurchaseRequestPriority.HIGH);
    expect(savedLines).toHaveLength(1);
    expect(savedLines[0]).toEqual(
      expect.objectContaining({ inventoryItemId: 'item-001', unitOfMeasure: 'metro' }),
    );
  });

  it('blocks updatePurchaseRequest when status is APPROVED', async () => {
    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      findOne: jest.fn().mockResolvedValue({
        id: 'pr-bad-001',
        tenantId: 'tenant-001',
        status: PurchaseRequestStatus.APPROVED,
      }),
      count: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));
    const service = new PurchasingService(
      {} as DataSource,
      new PurchasingPolicyService(),
      { applyQuoteToInvitation: jest.fn() } as unknown as RfqService,
      supplierProfileServiceMock,
    );

    await expect(
      service.updatePurchaseRequest('pr-bad-001', { title: 'No debe pasar' }, actor),
    ).rejects.toThrow('La solicitud no admite edición en su estado actual.');
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('blocks updatePurchaseRequest when request already has quotes', async () => {
    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      findOne: jest.fn().mockResolvedValue({
        id: 'pr-quoted-001',
        tenantId: 'tenant-001',
        status: PurchaseRequestStatus.PENDING_QUOTES,
      }),
      count: jest.fn().mockResolvedValue(2),
      find: jest.fn(),
      save: jest.fn(),
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));
    const service = new PurchasingService(
      {} as DataSource,
      new PurchasingPolicyService(),
      { applyQuoteToInvitation: jest.fn() } as unknown as RfqService,
      supplierProfileServiceMock,
    );

    await expect(
      service.updatePurchaseRequest('pr-quoted-001', { title: 'No debe pasar' }, actor),
    ).rejects.toThrow('cotizaciones');
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('approves purchase order from PENDING_APPROVAL', async () => {
    const orderRecord = {
      id: 'po-pend-001',
      tenantId: 'tenant-001',
      orderNumber: 'PO-000050',
      status: PurchaseOrderStatus.PENDING_APPROVAL,
      approvedByUserId: null as string | null,
      updatedAt: new Date(),
    };
    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      findOne: jest.fn().mockResolvedValue(orderRecord),
      save: jest.fn().mockImplementation(async (_entity, payload) => payload),
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));
    const service = new PurchasingService(
      {} as DataSource,
      new PurchasingPolicyService(),
      { applyQuoteToInvitation: jest.fn() } as unknown as RfqService,
      supplierProfileServiceMock,
    );

    const result = await service.approvePurchaseOrder('po-pend-001', actor);

    expect(result.status).toBe(PurchaseOrderStatus.APPROVED);
    expect(result.approvedByUserId).toBe(actor.sub);
  });

  it('blocks approvePurchaseOrder when order is already APPROVED', async () => {
    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      findOne: jest.fn().mockResolvedValue({
        id: 'po-already-001',
        tenantId: 'tenant-001',
        orderNumber: 'PO-000051',
        status: PurchaseOrderStatus.APPROVED,
      }),
      save: jest.fn(),
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));
    const service = new PurchasingService(
      {} as DataSource,
      new PurchasingPolicyService(),
      { applyQuoteToInvitation: jest.fn() } as unknown as RfqService,
      supplierProfileServiceMock,
    );

    await expect(service.approvePurchaseOrder('po-already-001', actor)).rejects.toThrow(
      'Pendiente de aprobación',
    );
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('cancels purchase order from APPROVED with reason and actor', async () => {
    const orderRecord = {
      id: 'po-cancel-001',
      tenantId: 'tenant-001',
      orderNumber: 'PO-000060',
      status: PurchaseOrderStatus.APPROVED,
      cancellationReason: null as string | null,
      cancelledByUserId: null as string | null,
      updatedAt: new Date(),
    };
    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      findOne: jest.fn().mockResolvedValue(orderRecord),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
      }),
      save: jest.fn().mockImplementation(async (_entity, payload) => payload),
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));
    const service = new PurchasingService(
      {} as DataSource,
      new PurchasingPolicyService(),
      { applyQuoteToInvitation: jest.fn() } as unknown as RfqService,
      supplierProfileServiceMock,
    );

    const result = await service.cancelPurchaseOrder(
      'po-cancel-001',
      { reason: 'Proveedor no disponible' },
      actor,
    );

    expect(result.status).toBe(PurchaseOrderStatus.CANCELLED);
    expect(result.cancellationReason).toBe('Proveedor no disponible');
    expect(result.cancelledByUserId).toBe(actor.sub);
  });

  it('blocks cancelPurchaseOrder when order has received items', async () => {
    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      findOne: jest.fn().mockResolvedValue({
        id: 'po-recv-001',
        tenantId: 'tenant-001',
        orderNumber: 'PO-000061',
        status: PurchaseOrderStatus.APPROVED,
      }),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
      }),
      save: jest.fn(),
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));
    const service = new PurchasingService(
      {} as DataSource,
      new PurchasingPolicyService(),
      { applyQuoteToInvitation: jest.fn() } as unknown as RfqService,
      supplierProfileServiceMock,
    );

    await expect(
      service.cancelPurchaseOrder('po-recv-001', { reason: 'Sin efecto' }, actor),
    ).rejects.toThrow('mercancía recibida');
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('blocks cancelPurchaseOrder when order is CLOSED', async () => {
    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      findOne: jest.fn().mockResolvedValue({
        id: 'po-closed-001',
        tenantId: 'tenant-001',
        orderNumber: 'PO-000062',
        status: PurchaseOrderStatus.CLOSED,
      }),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
      }),
      save: jest.fn(),
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));
    const service = new PurchasingService(
      {} as DataSource,
      new PurchasingPolicyService(),
      { applyQuoteToInvitation: jest.fn() } as unknown as RfqService,
      supplierProfileServiceMock,
    );

    await expect(
      service.cancelPurchaseOrder('po-closed-001', { reason: 'No aplica' }, actor),
    ).rejects.toThrow('no está en un estado que permita cancelarla');
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('closes purchase order from FULLY_RECEIVED status', async () => {
    const orderRecord = {
      id: 'po-fully-001',
      tenantId: 'tenant-001',
      orderNumber: 'PO-000070',
      status: PurchaseOrderStatus.FULLY_RECEIVED,
      closedByUserId: null as string | null,
      updatedAt: new Date(),
    };
    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      findOne: jest.fn().mockResolvedValue(orderRecord),
      save: jest.fn().mockImplementation(async (_entity, payload) => payload),
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));
    const service = new PurchasingService(
      {} as DataSource,
      new PurchasingPolicyService(),
      { applyQuoteToInvitation: jest.fn() } as unknown as RfqService,
      supplierProfileServiceMock,
    );

    const result = await service.closePurchaseOrder('po-fully-001', actor);

    expect(result.status).toBe(PurchaseOrderStatus.CLOSED);
    expect(result.closedByUserId).toBe(actor.sub);
  });

  it('blocks closePurchaseOrder when order is not FULLY_RECEIVED', async () => {
    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      findOne: jest.fn().mockResolvedValue({
        id: 'po-partial-001',
        tenantId: 'tenant-001',
        orderNumber: 'PO-000071',
        status: PurchaseOrderStatus.PARTIALLY_RECEIVED,
      }),
      save: jest.fn(),
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));
    const service = new PurchasingService(
      {} as DataSource,
      new PurchasingPolicyService(),
      { applyQuoteToInvitation: jest.fn() } as unknown as RfqService,
      supplierProfileServiceMock,
    );

    await expect(service.closePurchaseOrder('po-partial-001', actor)).rejects.toThrow(
      'completamente recibida',
    );
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rejects reject from DRAFT with Spanish BadRequest', async () => {
    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      findOne: jest.fn().mockResolvedValue({
        id: 'pr-004',
        tenantId: 'tenant-001',
        status: PurchaseRequestStatus.DRAFT,
      }),
      find: jest.fn(),
      save: jest.fn(),
    };
    const cancelActiveForRequest = jest.fn();

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));
    const service = new PurchasingService(
      {} as DataSource,
      new PurchasingPolicyService(),
      { applyQuoteToInvitation: jest.fn(), cancelActiveForRequest } as unknown as RfqService,
      supplierProfileServiceMock,
    );

    await expect(
      service.rejectPurchaseRequest('pr-004', { reason: 'Motivo suficientemente largo' }, actor),
    ).rejects.toThrow('La solicitud no está en un estado que permita rechazarla.');
    expect(cancelActiveForRequest).not.toHaveBeenCalled();
  });

  it('transitions DRAFT to PENDING_APPROVAL when registering a manual quote', async () => {
    const requestRecord = {
      id: 'pr-quote-draft',
      tenantId: 'tenant-001',
      status: PurchaseRequestStatus.DRAFT,
      notes: null as string | null,
    };
    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      findOne: jest.fn().mockResolvedValue(requestRecord),
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      }),
      create: jest.fn((_entity, payload) => payload),
      save: jest.fn().mockImplementation(async (_entity, payload) => ({
        id: 'quote-001',
        ...payload,
      })),
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));
    const service = new PurchasingService(
      {} as DataSource,
      new PurchasingPolicyService(),
      { applyQuoteToInvitation: jest.fn() } as unknown as RfqService,
      supplierProfileServiceMock,
    );

    await service.addSupplierQuote(
      'pr-quote-draft',
      {
        partyRefId: 'party-001',
        quoteNumber: 'Q-DRAFT-001',
        amount: 120000,
        currency: 'cop',
      },
      actor,
    );

    expect(requestRecord.status).toBe(PurchaseRequestStatus.PENDING_APPROVAL);
    expect(manager.save).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: 'pr-quote-draft',
        status: PurchaseRequestStatus.PENDING_APPROVAL,
      }),
    );
  });

  it('blocks manual quote when an active RFQ exists (C1)', async () => {
    const requestRecord = {
      id: 'pr-quote-rfq',
      tenantId: 'tenant-001',
      status: PurchaseRequestStatus.DRAFT,
      notes: null as string | null,
    };
    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      findOne: jest.fn().mockResolvedValue(requestRecord),
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({
          id: 'rfq-active',
          status: 'DRAFT',
        }),
      }),
      create: jest.fn((_entity, payload) => payload),
      save: jest.fn().mockImplementation(async (_entity, payload) => ({
        id: 'quote-002',
        ...payload,
      })),
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));
    const service = new PurchasingService(
      {} as DataSource,
      new PurchasingPolicyService(),
      { applyQuoteToInvitation: jest.fn() } as unknown as RfqService,
      supplierProfileServiceMock,
    );

    await expect(
      service.addSupplierQuote(
        'pr-quote-rfq',
        {
          partyRefId: 'party-001',
          quoteNumber: 'Q-RFQ-001',
          amount: 150000,
          currency: 'cop',
        },
        actor,
      ),
    ).rejects.toThrow('ronda de cotización activa');
    expect(requestRecord.status).toBe(PurchaseRequestStatus.DRAFT);
  });

  it('transitions PENDING_QUOTES to PENDING_APPROVAL on manual quote without RFQ', async () => {
    const requestRecord = {
      id: 'pr-quote-pending',
      tenantId: 'tenant-001',
      status: PurchaseRequestStatus.PENDING_QUOTES,
      notes: null as string | null,
    };
    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      findOne: jest.fn().mockResolvedValue(requestRecord),
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      }),
      create: jest.fn((_entity, payload) => payload),
      save: jest.fn().mockImplementation(async (_entity, payload) => ({
        id: 'quote-003',
        ...payload,
      })),
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));
    const service = new PurchasingService(
      {} as DataSource,
      new PurchasingPolicyService(),
      { applyQuoteToInvitation: jest.fn() } as unknown as RfqService,
      supplierProfileServiceMock,
    );

    await service.addSupplierQuote(
      'pr-quote-pending',
      {
        partyRefId: 'party-001',
        quoteNumber: 'Q-PQ-001',
        amount: 180000,
        currency: 'cop',
      },
      actor,
    );

    expect(requestRecord.status).toBe(PurchaseRequestStatus.PENDING_APPROVAL);
  });

  it('persists quote lines and derives amount when the request has lines', async () => {
    const requestRecord = {
      id: 'pr-quote-lines',
      tenantId: 'tenant-001',
      status: PurchaseRequestStatus.DRAFT,
      notes: null as string | null,
    };
    const prLine = {
      id: '11111111-1111-1111-1111-111111111111',
      quantityRequested: '10',
    };
    const savedQuotes: unknown[] = [];
    const savedLines: unknown[] = [];
    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      findOne: jest.fn().mockResolvedValue(requestRecord),
      find: jest.fn().mockResolvedValue([prLine]),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      }),
      create: jest.fn((_entity, payload) => payload),
      save: jest.fn().mockImplementation(async (entity, payload) => {
        if (Array.isArray(payload)) {
          const withIds = payload.map((row, index) => ({ id: `ql-${index + 1}`, ...row }));
          savedLines.push(...withIds);
          return withIds;
        }
        const saved = { id: 'quote-lines-001', ...payload };
        savedQuotes.push(saved);
        return saved;
      }),
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));
    const service = new PurchasingService(
      {} as DataSource,
      new PurchasingPolicyService(),
      { applyQuoteToInvitation: jest.fn() } as unknown as RfqService,
      supplierProfileServiceMock,
    );

    const result = await service.addSupplierQuote(
      'pr-quote-lines',
      {
        partyRefId: 'party-001',
        quoteNumber: 'Q-LINES-001',
        currency: 'COP',
        lines: [{ purchaseRequestLineId: prLine.id, unitCost: 1500 }],
      },
      actor,
    );

    expect(savedQuotes[0]).toEqual(
      expect.objectContaining({ amount: '15000.00', shippingCost: '0.00' }),
    );
    expect(result.lines).toHaveLength(1);
    expect(savedLines[0]).toEqual(
      expect.objectContaining({
        purchaseRequestLineId: prLine.id,
        unitCost: '1500.00',
        lineAmount: '15000.00',
        quantity: '10.00',
      }),
    );
  });

  it('persists shippingCost without altering product amount (CA-19-01)', async () => {
    const requestRecord = {
      id: 'pr-quote-ship',
      tenantId: 'tenant-001',
      status: PurchaseRequestStatus.DRAFT,
      notes: null as string | null,
    };
    const prLine = {
      id: '11111111-1111-1111-1111-111111111111',
      quantityRequested: '2',
    };
    const savedQuotes: unknown[] = [];
    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      findOne: jest.fn().mockResolvedValue(requestRecord),
      find: jest.fn().mockResolvedValue([prLine]),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      }),
      create: jest.fn((_entity, payload) => payload),
      save: jest.fn().mockImplementation(async (_entity, payload) => {
        if (Array.isArray(payload)) {
          return payload.map((row, index) => ({ id: `ql-${index + 1}`, ...row }));
        }
        const saved = { id: 'quote-ship-001', ...payload };
        savedQuotes.push(saved);
        return saved;
      }),
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));
    const service = new PurchasingService(
      {} as DataSource,
      new PurchasingPolicyService(),
      { applyQuoteToInvitation: jest.fn() } as unknown as RfqService,
      supplierProfileServiceMock,
    );

    await service.addSupplierQuote(
      'pr-quote-ship',
      {
        partyRefId: 'party-001',
        quoteNumber: 'Q-SHIP-001',
        currency: 'COP',
        shippingCost: 25000,
        lines: [{ purchaseRequestLineId: prLine.id, unitCost: 1000 }],
      },
      actor,
    );

    expect(savedQuotes[0]).toEqual(
      expect.objectContaining({ amount: '2000.00', shippingCost: '25000.00' }),
    );
  });

  it('rejects quote lines that do not belong to the purchase request (CA-18-03)', async () => {
    const requestRecord = {
      id: 'pr-quote-foreign',
      tenantId: 'tenant-001',
      status: PurchaseRequestStatus.DRAFT,
      notes: null as string | null,
    };
    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      findOne: jest.fn().mockResolvedValue(requestRecord),
      find: jest
        .fn()
        .mockResolvedValue([
          { id: '11111111-1111-1111-1111-111111111111', quantityRequested: '2' },
        ]),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      }),
      create: jest.fn((_entity, payload) => payload),
      save: jest.fn(),
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));
    const service = new PurchasingService(
      {} as DataSource,
      new PurchasingPolicyService(),
      { applyQuoteToInvitation: jest.fn() } as unknown as RfqService,
      supplierProfileServiceMock,
    );

    await expect(
      service.addSupplierQuote(
        'pr-quote-foreign',
        {
          partyRefId: 'party-001',
          quoteNumber: 'Q-FOREIGN',
          currency: 'COP',
          lines: [
            {
              purchaseRequestLineId: '22222222-2222-2222-2222-222222222222',
              unitCost: 100,
            },
          ],
        },
        actor,
      ),
    ).rejects.toThrow('no pertenecen a esta solicitud');
    expect(manager.save).not.toHaveBeenCalled();
  });
});

describe('PurchasingQueryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns request detail with lines, quotes and awards scoped by line ids', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'pr-001',
        tenantId: 'tenant-001',
        requestNumber: 'PR-000010',
        requestType: PurchaseRequestType.REPLENISHMENT,
        exceptionReason: null,
        justification: 'Reposición preventiva de equipos de acceso.',
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
            amount: '100000',
          },
        ])
        .mockResolvedValueOnce([])
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
      getSupplierSummariesBatch: jest.fn().mockResolvedValue(new Map()),
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
    expect(result.quotes[0]?.lines).toEqual([]);
    expect(result.awards).toHaveLength(1);
    expect(result.rfq).toBeNull();
    expect(manager.find).toHaveBeenNthCalledWith(
      4,
      expect.anything(),
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-001',
          purchaseRequestLineId: expect.anything(),
        }),
      }),
    );
    expect(supplierPartyPort.getSupplierSummariesBatch).not.toHaveBeenCalled();
  });

  it('enriches RFQ invitations with supplier displayName', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'pr-010',
        tenantId: 'tenant-001',
        requestNumber: 'PR-000020',
        requestType: PurchaseRequestType.REPLENISHMENT,
        exceptionReason: null,
        justification: 'Reposición con ronda de cotización abierta.',
      }),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({
          id: 'rfq-001',
          tenantId: 'tenant-001',
          purchaseRequestId: 'pr-010',
          status: 'SENT',
        }),
      }),
      find: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: 'inv-001',
            tenantId: 'tenant-001',
            rfqId: 'rfq-001',
            partyRefId: 'party-001',
            status: 'INVITED',
          },
        ]),
    };
    const supplierPartyPort: jest.Mocked<SupplierPartyPort> = {
      getSupplierSummary: jest.fn(),
      getSupplierSummariesBatch: jest.fn().mockResolvedValue(
        new Map([
          [
            'party-001',
            {
              partyRefId: 'party-001',
              displayName: 'Proveedor Andino',
              primaryContact: null,
              phone: null,
              email: null,
              city: null,
              status: PartyStatus.ACTIVE,
            },
          ],
        ]),
      ),
      searchSuppliers: jest.fn(),
    } as never;

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));
    const service = new PurchasingQueryService(
      {} as DataSource,
      supplierPartyPort,
      new PurchasingPolicyService(),
    );

    const result = await service.getRequestDetail('pr-010');

    expect(result.rfq).not.toBeNull();
    expect(result.rfq?.invitations).toEqual([
      expect.objectContaining({
        id: 'inv-001',
        partyRefId: 'party-001',
        displayName: 'Proveedor Andino',
      }),
    ]);
    expect(supplierPartyPort.getSupplierSummariesBatch).toHaveBeenCalledWith(['party-001']);
    expect(manager.find).toHaveBeenCalledTimes(4);
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
      getSupplierSummariesBatch: jest.fn(),
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
      getSupplierSummariesBatch: jest.fn(),
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
        created: true,
      }),
    };
    const serializedAssetServiceMock = {
      normalizeSerial: jest.fn((serial: string) => serial.trim().toUpperCase()),
      createReceivedAssetWithManager: jest.fn(),
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
      { applyReceiptCostingWithManager: jest.fn().mockResolvedValue(undefined) } as never,
      domainEventPublisherMock as never,
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
    expect(result.receipt.receivedAt).toEqual(new Date('2026-06-25T13:00:00.000Z'));
    expect(manager.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        receiptNumber: 'GR-000006',
        receivedAt: new Date('2026-06-25T13:00:00.000Z'),
      }),
    );
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
      { applyReceiptCostingWithManager: jest.fn().mockResolvedValue(undefined) } as never,
      domainEventPublisherMock as never,
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
