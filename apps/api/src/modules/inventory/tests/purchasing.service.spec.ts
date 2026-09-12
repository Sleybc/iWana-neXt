import { BadRequestException, ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  GoodsReceipt,
  GoodsReceiptLine,
  InventoryItem,
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseRequest,
  PurchaseRequestLine,
  PurchaseRequestLineAward,
  PurchaseRfq,
  StockLot,
  SupplierQuote,
  SupplierQuoteLine,
  SupplierQuoteTax,
  runInTenantSchema,
} from '@iwana/db';
import {
  GoodsReceiptStatus,
  InventoryTrackingMode,
  PartyStatus,
  PurchaseOrderStatus,
  PurchaseRequestAwardCoverage,
  PurchaseRequestLineSourceKind,
  PurchaseRequestLineStatus,
  PurchaseRequestPriority,
  PurchaseRequestStatus,
  PurchaseRequestType,
  PurchaseRfqStatus,
  StockBalanceCondition,
  StockMovementOrigin,
  TaxCategory,
  TaxContext,
  TaxTreatment,
  QuoteShippingArrangement,
  UserRole,
} from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { TaxCatalogReadPort } from '../../taxation/ports/tax-catalog-read.port';
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
  SupplierQuoteLine: class SupplierQuoteLine {},
  SupplierQuoteTax: class SupplierQuoteTax {},
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

const emptyTaxCatalogPort = {
  listByContext: jest.fn().mockResolvedValue([]),
  findActiveByCode: jest.fn().mockResolvedValue(null),
  resolveSystemPreset: jest.fn().mockResolvedValue(null),
  findById: jest.fn().mockResolvedValue(null),
} as unknown as TaxCatalogReadPort;

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

  // ===== Test-guarda de `validateLineAward` (CA-310) =====
  // CONGELA el comportamiento exacto de la política de adjudicación por línea:
  // es test-guarda por decisión del CTO (Fase 30, prompt §1). Cualquier cambio
  // de reglas o de mensajes debe ser una decisión explícita, no un accidente.

  it('CA-310: bloquea la adjudicación que excede lo solicitado con mensaje exacto', () => {
    const blockingReason = service.validateLineAward({
      requestType: PurchaseRequestType.REPLENISHMENT,
      requestedQuantity: 2,
      existingAwardedQuantity: 0,
      newAwardedQuantity: 3,
    });

    expect(blockingReason).toBe('La adjudicación excede la cantidad solicitada en la línea.');
  });

  it('CA-310: bloquea adjudicación parcial en tipos no PROJECT con mensaje exacto', () => {
    const blockingReason = service.validateLineAward({
      requestType: PurchaseRequestType.REPLENISHMENT,
      requestedQuantity: 2,
      existingAwardedQuantity: 0,
      newAwardedQuantity: 1,
    });

    expect(blockingReason).toBe(
      'Solo las solicitudes de proyecto permiten adjudicaciones parciales por línea.',
    );
  });

  it('CA-310: no-PROJECT con adjudicación exacta devuelve null', () => {
    expect(
      service.validateLineAward({
        requestType: PurchaseRequestType.REPLENISHMENT,
        requestedQuantity: 2,
        existingAwardedQuantity: 0,
        newAwardedQuantity: 2,
      }),
    ).toBeNull();
  });

  it('CA-310: PROJECT admite adjudicación parcial por línea', () => {
    expect(
      service.validateLineAward({
        requestType: PurchaseRequestType.PROJECT,
        requestedQuantity: 2,
        existingAwardedQuantity: 0,
        newAwardedQuantity: 1,
      }),
    ).toBeNull();
  });

  it('CA-310: PROJECT también se bloquea al exceder lo solicitado', () => {
    expect(
      service.validateLineAward({
        requestType: PurchaseRequestType.PROJECT,
        requestedQuantity: 2,
        existingAwardedQuantity: 1.5,
        newAwardedQuantity: 1,
      }),
    ).toBe('La adjudicación excede la cantidad solicitada en la línea.');
  });
});

describe('PurchasingService', () => {
  const supplierProfileServiceMock = {
    assertNotBlockedForPurchasing: jest.fn().mockResolvedValue(undefined),
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
      emptyTaxCatalogPort,
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
      emptyTaxCatalogPort,
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
      emptyTaxCatalogPort,
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
      emptyTaxCatalogPort,
    );

    await expect(
      service.createLineAwards(
        'pr-001',
        {
          awards: [
            {
              purchaseRequestLineId: 'line-001',
              awardedPartyRefId: 'party-001',
              awardedQuantity: '1.00',
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
    const quote = {
      id: 'quote-001',
      tenantId: 'tenant-001',
      purchaseRequestId: 'pr-001',
      partyRefId: 'party-001',
      currency: 'COP',
    };
    const quoteLine = {
      id: 'ql-001',
      tenantId: 'tenant-001',
      supplierQuoteId: 'quote-001',
      purchaseRequestLineId: 'line-001',
      unitCost: '150.00',
    };
    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      findOne: jest.fn().mockImplementation(async (_entity, options) => {
        const where = options?.where ?? {};
        if (where.id === 'pr-001') {
          return requestRecord;
        }
        if (where.id === 'line-001') {
          return line;
        }
        if (where.id === 'quote-001' && where.purchaseRequestId === 'pr-001') {
          return quote;
        }
        if (where.supplierQuoteId === 'quote-001' && where.purchaseRequestLineId === 'line-001') {
          return quoteLine;
        }
        return null;
      }),
      find: jest.fn().mockImplementation(async (_entity, options) => {
        const where = options?.where ?? {};
        if ('purchaseRequestLineId' in where) {
          return [];
        }
        return [line];
      }),
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
      emptyTaxCatalogPort,
    );

    // Contrato congelado: la cantidad viaja como cadena decimal.
    const result = await service.createLineAwards(
      'pr-001',
      {
        awards: [
          {
            purchaseRequestLineId: 'line-001',
            awardedPartyRefId: 'party-001',
            awardedQuantity: '2.00',
            supplierQuoteId: 'quote-001',
          },
        ],
      },
      actor,
    );

    expect(result.awards).toHaveLength(1);
    expect(result.awards[0]).toEqual(
      expect.objectContaining({
        purchaseRequestLineId: 'line-001',
        awardedPartyRefId: 'party-001',
        supplierQuoteId: 'quote-001',
        // Snapshot económico congelado desde supplier_quote_lines.
        unitCost: '150.00',
        currency: 'COP',
      }),
    );
    expect(result.coverage).toBe(PurchaseRequestAwardCoverage.FULLY_AWARDED);
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
      emptyTaxCatalogPort,
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
      emptyTaxCatalogPort,
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
      emptyTaxCatalogPort,
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
      emptyTaxCatalogPort,
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
      emptyTaxCatalogPort,
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
      emptyTaxCatalogPort,
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
      emptyTaxCatalogPort,
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
      emptyTaxCatalogPort,
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
      emptyTaxCatalogPort,
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
      emptyTaxCatalogPort,
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

  it('cancel reverts derived state: line to AWARDED and request to APPROVED when nothing live remains', async () => {
    const orderRecord = {
      id: 'po-cancel-100',
      tenantId: 'tenant-001',
      purchaseRequestId: 'pr-001',
      orderNumber: 'PO-000100',
      status: PurchaseOrderStatus.APPROVED,
      cancellationReason: null as string | null,
      cancelledByUserId: null as string | null,
      updatedAt: new Date(),
    };
    const requestRecord = {
      id: 'pr-001',
      tenantId: 'tenant-001',
      status: PurchaseRequestStatus.CONVERTED_TO_PO,
    };
    const lineRecord = {
      id: 'line-1',
      tenantId: 'tenant-001',
      lineStatus: PurchaseRequestLineStatus.ORDERED,
    };
    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      findOne: jest.fn().mockImplementation((entity, criteria) => {
        if (entity === PurchaseOrder) {
          return Promise.resolve(orderRecord);
        }
        if (entity === PurchaseRequest) {
          return Promise.resolve(requestRecord);
        }
        if (entity === PurchaseRequestLine) {
          return Promise.resolve(criteria.where.id === 'line-1' ? lineRecord : null);
        }
        return Promise.resolve(null);
      }),
      find: jest.fn().mockImplementation((entity, criteria) => {
        if (entity === PurchaseOrderLine) {
          // Orden cancelada → su línea; línea de solicitud → órdenes vivas que la cubren.
          if (criteria.where.purchaseOrderId === 'po-cancel-100') {
            return Promise.resolve([
              {
                id: 'pol-1',
                purchaseOrderId: 'po-cancel-100',
                purchaseRequestLineId: 'line-1',
                quantity: '1.00',
              },
            ]);
          }
          return Promise.resolve([]);
        }
        if (entity === PurchaseRequestLineAward) {
          return Promise.resolve([{ awardedQuantity: '1.00' }]);
        }
        if (entity === PurchaseOrder) {
          return Promise.resolve([]);
        }
        if (entity === PurchaseRequestLine) {
          return Promise.resolve([lineRecord]);
        }
        return Promise.resolve([]);
      }),
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
      emptyTaxCatalogPort,
    );

    const result = await service.cancelPurchaseOrder(
      'po-cancel-100',
      { reason: 'Proveedor no disponible' },
      actor,
    );

    expect(result.status).toBe(PurchaseOrderStatus.CANCELLED);
    expect(lineRecord.lineStatus).toBe(PurchaseRequestLineStatus.AWARDED);
    expect(requestRecord.status).toBe(PurchaseRequestStatus.APPROVED);
    expect(manager.save).toHaveBeenCalledWith(PurchaseRequestLine, lineRecord);
    expect(manager.save).toHaveBeenCalledWith(PurchaseRequest, requestRecord);
  });

  it('cancel keeps line ORDERED and request CONVERTED when another live order covers the award', async () => {
    const orderRecord = {
      id: 'po-cancel-101',
      tenantId: 'tenant-001',
      purchaseRequestId: 'pr-001',
      orderNumber: 'PO-000101',
      status: PurchaseOrderStatus.APPROVED,
      cancellationReason: null as string | null,
      cancelledByUserId: null as string | null,
      updatedAt: new Date(),
    };
    const requestRecord = {
      id: 'pr-001',
      tenantId: 'tenant-001',
      status: PurchaseRequestStatus.CONVERTED_TO_PO,
    };
    const lineRecord = {
      id: 'line-1',
      tenantId: 'tenant-001',
      lineStatus: PurchaseRequestLineStatus.ORDERED,
    };
    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      findOne: jest.fn().mockImplementation((entity, criteria) => {
        if (entity === PurchaseOrder) {
          return Promise.resolve(orderRecord);
        }
        if (entity === PurchaseRequest) {
          return Promise.resolve(requestRecord);
        }
        if (entity === PurchaseRequestLine) {
          return Promise.resolve(criteria.where.id === 'line-1' ? lineRecord : null);
        }
        return Promise.resolve(null);
      }),
      find: jest.fn().mockImplementation((entity, criteria) => {
        if (entity === PurchaseOrderLine) {
          if (criteria.where.purchaseOrderId === 'po-cancel-101') {
            return Promise.resolve([
              {
                id: 'pol-1',
                purchaseOrderId: 'po-cancel-101',
                purchaseRequestLineId: 'line-1',
                quantity: '1.00',
              },
            ]);
          }
          // Otra orden viva sigue cubriendo la línea completa.
          return Promise.resolve([
            {
              id: 'pol-2',
              purchaseOrderId: 'po-live-1',
              purchaseRequestLineId: 'line-1',
              quantity: '1.00',
            },
          ]);
        }
        if (entity === PurchaseRequestLineAward) {
          return Promise.resolve([{ awardedQuantity: '1.00' }]);
        }
        if (entity === PurchaseOrder) {
          return Promise.resolve([
            {
              id: 'po-live-1',
              tenantId: 'tenant-001',
              purchaseRequestId: 'pr-001',
              status: PurchaseOrderStatus.APPROVED,
            },
          ]);
        }
        if (entity === PurchaseRequestLine) {
          return Promise.resolve([lineRecord]);
        }
        return Promise.resolve([]);
      }),
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
      emptyTaxCatalogPort,
    );

    await service.cancelPurchaseOrder('po-cancel-101', { reason: 'Duplicada' }, actor);

    expect(lineRecord.lineStatus).toBe(PurchaseRequestLineStatus.ORDERED);
    expect(requestRecord.status).toBe(PurchaseRequestStatus.CONVERTED_TO_PO);
    expect(manager.save).not.toHaveBeenCalledWith(PurchaseRequestLine, expect.anything());
    expect(manager.save).not.toHaveBeenCalledWith(PurchaseRequest, expect.anything());
  });

  it('cancel never degrades received lines', async () => {
    const orderRecord = {
      id: 'po-cancel-102',
      tenantId: 'tenant-001',
      purchaseRequestId: 'pr-001',
      orderNumber: 'PO-000102',
      status: PurchaseOrderStatus.APPROVED,
      cancellationReason: null as string | null,
      cancelledByUserId: null as string | null,
      updatedAt: new Date(),
    };
    const requestRecord = {
      id: 'pr-001',
      tenantId: 'tenant-001',
      status: PurchaseRequestStatus.CONVERTED_TO_PO,
    };
    const receivedLine = {
      id: 'line-1',
      tenantId: 'tenant-001',
      lineStatus: PurchaseRequestLineStatus.PARTIALLY_RECEIVED,
    };
    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      findOne: jest.fn().mockImplementation((entity, criteria) => {
        if (entity === PurchaseOrder) {
          return Promise.resolve(orderRecord);
        }
        if (entity === PurchaseRequest) {
          return Promise.resolve(requestRecord);
        }
        if (entity === PurchaseRequestLine) {
          return Promise.resolve(criteria.where.id === 'line-1' ? receivedLine : null);
        }
        return Promise.resolve(null);
      }),
      find: jest.fn().mockImplementation((entity, criteria) => {
        if (entity === PurchaseOrderLine) {
          if (criteria.where.purchaseOrderId === 'po-cancel-102') {
            return Promise.resolve([
              {
                id: 'pol-1',
                purchaseOrderId: 'po-cancel-102',
                purchaseRequestLineId: 'line-1',
                quantity: '1.00',
              },
            ]);
          }
          return Promise.resolve([]);
        }
        if (entity === PurchaseRequestLineAward) {
          return Promise.resolve([{ awardedQuantity: '1.00' }]);
        }
        if (entity === PurchaseOrder) {
          return Promise.resolve([]);
        }
        if (entity === PurchaseRequestLine) {
          return Promise.resolve([receivedLine]);
        }
        return Promise.resolve([]);
      }),
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
      emptyTaxCatalogPort,
    );

    await service.cancelPurchaseOrder('po-cancel-102', { reason: 'Sin efecto' }, actor);

    expect(receivedLine.lineStatus).toBe(PurchaseRequestLineStatus.PARTIALLY_RECEIVED);
    // La línea sigue en grupo «ordenada/recibida»: la solicitud sigue convertida.
    expect(requestRecord.status).toBe(PurchaseRequestStatus.CONVERTED_TO_PO);
    expect(manager.save).not.toHaveBeenCalledWith(PurchaseRequestLine, expect.anything());
    expect(manager.save).not.toHaveBeenCalledWith(PurchaseRequest, expect.anything());
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
      emptyTaxCatalogPort,
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
      emptyTaxCatalogPort,
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
      emptyTaxCatalogPort,
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
      emptyTaxCatalogPort,
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
      emptyTaxCatalogPort,
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
      emptyTaxCatalogPort,
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
      emptyTaxCatalogPort,
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
      emptyTaxCatalogPort,
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
      emptyTaxCatalogPort,
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
      emptyTaxCatalogPort,
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
      emptyTaxCatalogPort,
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

  it('persiste payableAmount y taxes calculados (CA-25-04)', async () => {
    const requestRecord = {
      id: 'pr-quote-tax',
      tenantId: 'tenant-001',
      status: PurchaseRequestStatus.DRAFT,
      notes: null as string | null,
    };
    const savedQuotes: unknown[] = [];
    const savedTaxes: unknown[] = [];
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
      save: jest.fn().mockImplementation(async (_entity, payload) => {
        if (Array.isArray(payload)) {
          savedTaxes.push(...payload);
          return payload.map((row, index) => ({ id: `tax-${index + 1}`, ...row }));
        }
        const saved = { id: 'quote-tax-001', ...payload };
        savedQuotes.push(saved);
        return saved;
      }),
    };

    const catalogPort = {
      ...emptyTaxCatalogPort,
      listByContext: jest.fn().mockResolvedValue([
        {
          id: 'def-iva',
          code: 'IVA_19',
          name: 'IVA 19%',
          category: TaxCategory.VAT,
          jurisdictionLevel: 'NATIONAL',
          municipalityCode: null,
          baseRate: '19',
          treatment: TaxTreatment.STANDARD,
          context: TaxContext.BOTH,
          origin: 'SYSTEM',
          isActive: true,
          notes: null,
        },
        {
          id: 'def-fte',
          code: 'RETE_FUENTE_SERVICIOS',
          name: 'Retención en la fuente — Servicios',
          category: TaxCategory.WITHHOLDING,
          jurisdictionLevel: 'NATIONAL',
          municipalityCode: null,
          baseRate: '4',
          treatment: TaxTreatment.STANDARD,
          context: TaxContext.PURCHASE,
          origin: 'SYSTEM',
          isActive: true,
          notes: null,
        },
        {
          id: 'def-ica',
          code: 'RETE_ICA',
          name: 'ReteICA — Bogotá',
          category: TaxCategory.MUNICIPAL,
          jurisdictionLevel: 'MUNICIPAL',
          municipalityCode: '11001',
          baseRate: '0.414',
          treatment: TaxTreatment.STANDARD,
          context: TaxContext.PURCHASE,
          origin: 'SYSTEM',
          isActive: true,
          notes: null,
        },
        {
          id: 'def-rete-iva',
          code: 'RETE_IVA',
          name: 'Rete IVA',
          category: TaxCategory.WITHHOLDING,
          jurisdictionLevel: 'NATIONAL',
          municipalityCode: null,
          baseRate: '15',
          treatment: TaxTreatment.STANDARD,
          context: TaxContext.PURCHASE,
          origin: 'SYSTEM',
          isActive: true,
          notes: null,
        },
      ]),
    } as unknown as TaxCatalogReadPort;

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));
    const service = new PurchasingService(
      {} as DataSource,
      new PurchasingPolicyService(),
      { applyQuoteToInvitation: jest.fn() } as unknown as RfqService,
      supplierProfileServiceMock,
      catalogPort,
    );

    const result = await service.addSupplierQuote(
      'pr-quote-tax',
      {
        partyRefId: 'party-001',
        quoteNumber: 'Q-TAX-001',
        amount: 100,
        currency: 'COP',
        taxes: [
          { code: 'IVA_19', applies: true, rate: 19 },
          { code: 'RETE_FUENTE_SERVICIOS', applies: true, rate: 4 },
          { code: 'RETE_ICA', applies: true, rate: 0.414 },
          { code: 'RETE_IVA', applies: true, rate: 15 },
        ],
      },
      actor,
    );

    expect(savedQuotes[0]).toEqual(
      expect.objectContaining({
        amount: '100.00',
        shippingCost: '0.00',
        payableAmount: '111.74',
      }),
    );
    expect(savedTaxes).toHaveLength(4);
    expect(result.taxes).toHaveLength(4);
    expect(result.payableAmount).toBe('111.74');
    expect(result.taxes.find((row) => row.code === 'RETE_IVA')).toEqual(
      expect.objectContaining({ taxAmount: '2.85', effect: 'WITHHOLD', applies: true }),
    );
  });

  it('rechaza código inactivo o fuera de PURCHASE con 400', async () => {
    const requestRecord = {
      id: 'pr-quote-bad-tax',
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
      save: jest.fn(),
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));
    const service = new PurchasingService(
      {} as DataSource,
      new PurchasingPolicyService(),
      { applyQuoteToInvitation: jest.fn() } as unknown as RfqService,
      supplierProfileServiceMock,
      emptyTaxCatalogPort,
    );

    await expect(
      service.addSupplierQuote(
        'pr-quote-bad-tax',
        {
          partyRefId: 'party-001',
          quoteNumber: 'Q-BAD',
          amount: 100,
          currency: 'COP',
          taxes: [{ code: 'IVA_19', applies: true, rate: 19 }],
        },
        actor,
      ),
    ).rejects.toThrow('catálogo de compras');
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('legacy sin taxes persiste payableAmount = amount + shipping', async () => {
    const requestRecord = {
      id: 'pr-quote-legacy',
      tenantId: 'tenant-001',
      status: PurchaseRequestStatus.DRAFT,
      notes: null as string | null,
    };
    const savedQuotes: unknown[] = [];
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
      save: jest.fn().mockImplementation(async (_entity, payload) => {
        const saved = { id: 'quote-legacy-001', ...payload };
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
      emptyTaxCatalogPort,
    );

    const result = await service.addSupplierQuote(
      'pr-quote-legacy',
      {
        partyRefId: 'party-001',
        quoteNumber: 'Q-LEGACY',
        amount: 2000,
        shippingCost: 250,
        currency: 'COP',
      },
      actor,
    );

    expect(savedQuotes[0]).toEqual(
      expect.objectContaining({
        amount: '2000.00',
        shippingCost: '250.00',
        payableAmount: '2250.00',
      }),
    );
    expect(result.taxes).toEqual([]);
  });

  it('el flete al transportador no entra al neto del proveedor', async () => {
    const requestRecord = {
      id: 'pr-quote-carrier',
      tenantId: 'tenant-001',
      status: PurchaseRequestStatus.DRAFT,
      notes: null as string | null,
    };
    const savedQuotes: unknown[] = [];
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
      save: jest.fn().mockImplementation(async (_entity, payload) => {
        const saved = { id: 'quote-carrier-001', ...payload };
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
      emptyTaxCatalogPort,
    );

    await service.addSupplierQuote(
      'pr-quote-carrier',
      {
        partyRefId: 'party-001',
        quoteNumber: 'Q-CARRIER',
        amount: 2000,
        shippingCost: 250,
        shippingArrangement: QuoteShippingArrangement.PAY_CARRIER,
        currency: 'COP',
      },
      actor,
    );

    expect(savedQuotes[0]).toEqual(
      expect.objectContaining({
        amount: '2000.00',
        shippingCost: '250.00',
        shippingArrangement: QuoteShippingArrangement.PAY_CARRIER,
        payableAmount: '2000.00',
      }),
    );
  });

  it('envío gratis fuerza shippingCost 0 aunque el cliente envíe un monto', async () => {
    const requestRecord = {
      id: 'pr-quote-free',
      tenantId: 'tenant-001',
      status: PurchaseRequestStatus.DRAFT,
      notes: null as string | null,
    };
    const savedQuotes: unknown[] = [];
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
      save: jest.fn().mockImplementation(async (_entity, payload) => {
        const saved = { id: 'quote-free-001', ...payload };
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
      emptyTaxCatalogPort,
    );

    await service.addSupplierQuote(
      'pr-quote-free',
      {
        partyRefId: 'party-001',
        quoteNumber: 'Q-FREE',
        amount: 2000,
        shippingCost: 99,
        shippingArrangement: QuoteShippingArrangement.FREE,
        currency: 'COP',
      },
      actor,
    );

    expect(savedQuotes[0]).toEqual(
      expect.objectContaining({
        shippingCost: '0.00',
        shippingArrangement: QuoteShippingArrangement.FREE,
        payableAmount: '2000.00',
      }),
    );
  });

  function createUpdateQuoteHarness(options: {
    requestStatus?: PurchaseRequestStatus;
    quote?: Record<string, unknown>;
    award?: Record<string, unknown> | null;
    rfq?: { id: string; status: PurchaseRfqStatus } | null;
    requestLines?: Array<Record<string, unknown>>;
  }) {
    const requestRecord = {
      id: 'pr-update',
      tenantId: 'tenant-001',
      status: options.requestStatus ?? PurchaseRequestStatus.PENDING_APPROVAL,
      notes: null as string | null,
    };
    const quoteRecord = {
      id: 'quote-001',
      tenantId: 'tenant-001',
      purchaseRequestId: 'pr-update',
      partyRefId: 'party-001',
      quoteNumber: 'Q-OLD',
      amount: '1000.00',
      shippingCost: '100.00',
      shippingArrangement: QuoteShippingArrangement.ON_INVOICE,
      payableAmount: '1100.00',
      currency: 'COP',
      validUntil: null as string | null,
      notes: null as string | null,
      rfqId: null as string | null,
      ...options.quote,
    };
    const deleted: Array<{ entity: unknown; where: unknown }> = [];
    const savedQuotes: unknown[] = [];
    const savedTaxes: unknown[] = [];
    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      findOne: jest.fn().mockImplementation((entity: unknown) => {
        if (entity === PurchaseRequest) {
          return requestRecord;
        }
        if (entity === SupplierQuote) {
          return quoteRecord;
        }
        if (entity === PurchaseRequestLineAward) {
          return options.award ?? null;
        }
        if (entity === PurchaseRfq) {
          return options.rfq ?? null;
        }
        return null;
      }),
      find: jest.fn().mockImplementation((entity: unknown) => {
        if (entity === PurchaseRequestLine) {
          return options.requestLines ?? [];
        }
        return [];
      }),
      create: jest.fn((_entity, payload) => payload),
      save: jest.fn().mockImplementation(async (entity: unknown, payload: unknown) => {
        if (entity === SupplierQuote) {
          savedQuotes.push(payload);
          return payload;
        }
        if (entity === SupplierQuoteTax) {
          savedTaxes.push(payload);
          return payload;
        }
        if (entity === SupplierQuoteLine) {
          return payload;
        }
        return payload;
      }),
      delete: jest.fn().mockImplementation(async (entity: unknown, where: unknown) => {
        deleted.push({ entity, where });
        return { affected: 1 };
      }),
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));
    const service = new PurchasingService(
      {} as DataSource,
      new PurchasingPolicyService(),
      { applyQuoteToInvitation: jest.fn() } as unknown as RfqService,
      supplierProfileServiceMock,
      emptyTaxCatalogPort,
    );

    return { service, manager, quoteRecord, savedQuotes, savedTaxes, deleted };
  }

  it('corrige una cotización en PENDING_APPROVAL y recalcula el neto', async () => {
    const { service, manager, savedQuotes, deleted } = createUpdateQuoteHarness({});

    const result = await service.updateSupplierQuote(
      'pr-update',
      'quote-001',
      {
        quoteNumber: 'Q-NEW',
        amount: 2000,
        shippingCost: 250,
        shippingArrangement: QuoteShippingArrangement.ON_INVOICE,
        currency: 'COP',
      },
      actor,
    );

    expect(savedQuotes[0]).toEqual(
      expect.objectContaining({
        quoteNumber: 'Q-NEW',
        amount: '2000.00',
        shippingCost: '250.00',
        payableAmount: '2250.00',
      }),
    );
    expect(result.payableAmount).toBe('2250.00');
    expect(manager.delete).toHaveBeenCalledWith(SupplierQuoteLine, {
      tenantId: 'tenant-001',
      supplierQuoteId: 'quote-001',
    });
    expect(manager.delete).toHaveBeenCalledWith(SupplierQuoteTax, {
      tenantId: 'tenant-001',
      supplierQuoteId: 'quote-001',
    });
    expect(deleted).toHaveLength(2);
  });

  it('permite corregir una cotización de RFQ mientras la ronda recibe respuestas', async () => {
    const { service, savedQuotes } = createUpdateQuoteHarness({
      quote: { rfqId: 'rfq-001' },
      rfq: { id: 'rfq-001', status: PurchaseRfqStatus.RECEIVING },
    });

    await service.updateSupplierQuote(
      'pr-update',
      'quote-001',
      {
        quoteNumber: 'Q-RFQ',
        amount: 800,
        currency: 'COP',
      },
      actor,
    );

    expect(savedQuotes[0]).toEqual(
      expect.objectContaining({ quoteNumber: 'Q-RFQ', amount: '800.00' }),
    );
  });

  it('rechaza corregir si la solicitud ya está aprobada', async () => {
    const { service, manager } = createUpdateQuoteHarness({
      requestStatus: PurchaseRequestStatus.APPROVED,
    });

    await expect(
      service.updateSupplierQuote(
        'pr-update',
        'quote-001',
        { quoteNumber: 'Q-NEW', amount: 2000, currency: 'COP' },
        actor,
      ),
    ).rejects.toThrow('Esta solicitud ya no admite correcciones de cotización.');
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rechaza corregir si la ronda de cotización ya cerró', async () => {
    const { service, manager } = createUpdateQuoteHarness({
      quote: { rfqId: 'rfq-001' },
      rfq: { id: 'rfq-001', status: PurchaseRfqStatus.CLOSED },
    });

    await expect(
      service.updateSupplierQuote(
        'pr-update',
        'quote-001',
        { quoteNumber: 'Q-NEW', amount: 2000, currency: 'COP' },
        actor,
      ),
    ).rejects.toThrow('La ronda de cotización ya no admite correcciones.');
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rechaza corregir una cotización ya adjudicada', async () => {
    const { service, manager } = createUpdateQuoteHarness({
      award: { id: 'award-001', supplierQuoteId: 'quote-001' },
    });

    await expect(
      service.updateSupplierQuote(
        'pr-update',
        'quote-001',
        { quoteNumber: 'Q-NEW', amount: 2000, currency: 'COP' },
        actor,
      ),
    ).rejects.toThrow('Esta cotización ya forma parte de una adjudicación y no se puede corregir.');
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('responde 404 si la cotización no pertenece a la solicitud', async () => {
    const requestRecord = {
      id: 'pr-update',
      tenantId: 'tenant-001',
      status: PurchaseRequestStatus.PENDING_APPROVAL,
      notes: null as string | null,
    };
    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      findOne: jest.fn().mockImplementation((entity: unknown) => {
        if (entity === PurchaseRequest) {
          return requestRecord;
        }
        return null;
      }),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn(),
      delete: jest.fn(),
    };
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));
    const service = new PurchasingService(
      {} as DataSource,
      new PurchasingPolicyService(),
      { applyQuoteToInvitation: jest.fn() } as unknown as RfqService,
      supplierProfileServiceMock,
      emptyTaxCatalogPort,
    );

    await expect(
      service.updateSupplierQuote(
        'pr-update',
        'quote-missing',
        { quoteNumber: 'Q-NEW', amount: 2000, currency: 'COP' },
        actor,
      ),
    ).rejects.toThrow('La cotización no existe en esta solicitud.');
    expect(manager.save).not.toHaveBeenCalled();
  });

  // ===== Fase 30 BE-1 — regresión del defecto «solicitud varada» =====

  /**
   * Manager en memoria que acumula órdenes y líneas de OC entre llamadas, para
   * simular la conversión por etapas de una misma solicitud (el double del
   * DataSource refleja lo ya persistido en la transacción). Fase 30 BE-2:
   * también persiste awards (create/revoke) y resuelve cotización y su línea
   * para CA-304/307/308; `quoteCount` alimenta el recálculo OPEN/PENDING_QUOTE
   * de la revocación.
   */
  function createOrderingHarness(params: {
    request: Record<string, unknown>;
    lines: Array<Record<string, unknown>>;
    awards: Array<Record<string, unknown>>;
    quote?: Record<string, unknown>;
    quoteLine?: Record<string, unknown>;
    quoteCount?: number;
  }) {
    const orders: Array<Record<string, unknown>> = [];
    const orderLines: Array<Record<string, unknown>> = [];

    const manager = {
      transaction: jest
        .fn()
        .mockImplementation(async (work: (m: unknown) => unknown) => work(manager)),
      findOne: jest
        .fn()
        .mockImplementation(
          async (entity: unknown, options?: { where?: Record<string, unknown> }) => {
            const where = options?.where ?? {};
            const id = where.id;
            if (entity === PurchaseRequest && id === params.request.id) {
              return params.request;
            }
            if (entity === SupplierQuote) {
              return params.quote &&
                params.quote.id === id &&
                params.quote.purchaseRequestId === where.purchaseRequestId
                ? params.quote
                : null;
            }
            if (entity === SupplierQuoteLine) {
              return params.quoteLine &&
                params.quoteLine.supplierQuoteId === where.supplierQuoteId &&
                params.quoteLine.purchaseRequestLineId === where.purchaseRequestLineId
                ? params.quoteLine
                : null;
            }
            if (entity === PurchaseRequestLineAward) {
              return params.awards.find((award) => award.id === id) ?? null;
            }
            return params.lines.find((line) => line.id === id) ?? null;
          },
        ),
      find: jest
        .fn()
        .mockImplementation(
          async (entity: unknown, options?: { where?: Record<string, unknown> }) => {
            const where = options?.where ?? {};
            if (entity === PurchaseRequestLineAward) {
              return params.awards.filter(
                (award) => award.purchaseRequestLineId === where.purchaseRequestLineId,
              );
            }
            if (entity === PurchaseOrder) {
              return orders.filter((order) => order.purchaseRequestId === where.purchaseRequestId);
            }
            if (entity === PurchaseOrderLine) {
              return orderLines.filter(
                (orderLine) => orderLine.purchaseRequestLineId === where.purchaseRequestLineId,
              );
            }
            if (entity === PurchaseRequestLine) {
              return params.lines.filter(
                (line) => line.purchaseRequestId === where.purchaseRequestId,
              );
            }
            return [];
          },
        ),
      createQueryBuilder: jest
        .fn()
        .mockImplementation(() =>
          createNumberQueryBuilder(`PO-${String(40 + orders.length).padStart(6, '0')}`),
        ),
      create: jest.fn((_entity: unknown, payload: Record<string, unknown>) => payload),
      save: jest
        .fn()
        .mockImplementation(async (entity: unknown, payload: Record<string, unknown>) => {
          if (entity === PurchaseOrder && 'orderNumber' in payload) {
            const order = { id: `po-${orders.length + 1}`, status: 'APPROVED', ...payload };
            orders.push(order);
            return order;
          }
          if (entity === PurchaseOrderLine && 'purchaseOrderId' in payload) {
            const orderLine = { id: `pol-${orderLines.length + 1}`, ...payload };
            orderLines.push(orderLine);
            return orderLine;
          }
          if (entity === PurchaseRequestLineAward) {
            if (payload.id) {
              const awardIndex = params.awards.findIndex((award) => award.id === payload.id);
              if (awardIndex >= 0) {
                params.awards[awardIndex] = { ...params.awards[awardIndex], ...payload };
                return params.awards[awardIndex];
              }
            }
            const savedAward = { id: `award-${params.awards.length + 1}`, ...payload };
            params.awards.push(savedAward);
            return savedAward;
          }
          return payload;
        }),
      delete: jest.fn().mockImplementation(async (entity: unknown, criteria?: { id?: string }) => {
        if (entity === PurchaseRequestLineAward && criteria?.id) {
          const awardIndex = params.awards.findIndex((award) => award.id === criteria.id);
          if (awardIndex >= 0) {
            params.awards.splice(awardIndex, 1);
          }
        }
      }),
      count: jest
        .fn()
        .mockImplementation(
          async (entity: unknown, _options?: { where?: Record<string, unknown> }) => {
            if (entity === SupplierQuote) {
              return params.quoteCount ?? 0;
            }
            return 0;
          },
        ),
    };

    return { manager, orders, orderLines };
  }

  function createRegressionService(manager: Record<string, jest.Mock>): PurchasingService {
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));
    return new PurchasingService(
      {} as DataSource,
      new PurchasingPolicyService(),
      { applyQuoteToInvitation: jest.fn() } as unknown as RfqService,
      supplierProfileServiceMock,
      emptyTaxCatalogPort,
    );
  }

  it('R1: orden batch parcial deja la solicitud en APPROVED; al cubrir las 4 líneas queda CONVERTED_TO_PO', async () => {
    const requestRecord = {
      id: 'pr-r1',
      tenantId: 'tenant-001',
      status: PurchaseRequestStatus.APPROVED,
      neededByDate: null as string | null,
    };
    const makeLine = (id: string) => ({
      id,
      tenantId: 'tenant-001',
      purchaseRequestId: 'pr-r1',
      inventoryItemId: `item-${id}`,
      quantityRequested: '2.00',
      lineStatus: PurchaseRequestLineStatus.AWARDED,
    });
    const lines = [makeLine('line-1'), makeLine('line-2'), makeLine('line-3'), makeLine('line-4')];
    const awards = [
      {
        id: 'award-1',
        purchaseRequestLineId: 'line-1',
        awardedPartyRefId: 'party-001',
        awardedQuantity: '2.00',
      },
      {
        id: 'award-2',
        purchaseRequestLineId: 'line-2',
        awardedPartyRefId: 'party-001',
        awardedQuantity: '2.00',
      },
      {
        id: 'award-3',
        purchaseRequestLineId: 'line-3',
        awardedPartyRefId: 'party-002',
        awardedQuantity: '2.00',
      },
      {
        id: 'award-4',
        purchaseRequestLineId: 'line-4',
        awardedPartyRefId: 'party-002',
        awardedQuantity: '2.00',
      },
    ].map((award) => ({ tenantId: 'tenant-001', ...award }));

    const { manager } = createOrderingHarness({ request: requestRecord, lines, awards });
    const service = createRegressionService(manager);

    // Primera tanda: solo las 2 líneas del proveedor 001.
    const first = await service.createPurchaseOrderFromRequest(
      {
        purchaseRequestId: 'pr-r1',
        status: PurchaseOrderStatus.APPROVED,
        orders: [
          {
            partyRefId: 'party-001',
            lines: [
              {
                purchaseRequestLineId: 'line-1',
                itemId: 'item-line-1',
                quantity: 2,
                unitCost: 100,
              },
              {
                purchaseRequestLineId: 'line-2',
                itemId: 'item-line-2',
                quantity: 2,
                unitCost: 100,
              },
            ],
          },
        ],
      },
      actor,
    );

    expect('orders' in first).toBe(true);
    // Defecto corregido: la orden parcial NO varar la solicitud en CONVERTED_TO_PO.
    expect(requestRecord.status).toBe(PurchaseRequestStatus.APPROVED);
    expect(lines.map((line) => line.lineStatus)).toEqual([
      PurchaseRequestLineStatus.ORDERED,
      PurchaseRequestLineStatus.ORDERED,
      PurchaseRequestLineStatus.AWARDED,
      PurchaseRequestLineStatus.AWARDED,
    ]);

    // Segunda tanda: las 2 líneas restantes del proveedor 002.
    const second = await service.createPurchaseOrderFromRequest(
      {
        purchaseRequestId: 'pr-r1',
        status: PurchaseOrderStatus.APPROVED,
        orders: [
          {
            partyRefId: 'party-002',
            lines: [
              {
                purchaseRequestLineId: 'line-3',
                itemId: 'item-line-3',
                quantity: 2,
                unitCost: 100,
              },
              {
                purchaseRequestLineId: 'line-4',
                itemId: 'item-line-4',
                quantity: 2,
                unitCost: 100,
              },
            ],
          },
        ],
      },
      actor,
    );

    expect('orders' in second).toBe(true);
    expect(requestRecord.status).toBe(PurchaseRequestStatus.CONVERTED_TO_PO);
  });

  it('R2: rechaza con código ORDER_EXCEEDS_AWARD cuando las órdenes acumuladas superan lo adjudicado', async () => {
    const requestRecord = {
      id: 'pr-r2',
      tenantId: 'tenant-001',
      status: PurchaseRequestStatus.APPROVED,
      neededByDate: null as string | null,
    };
    const lineOne = {
      id: 'line-1',
      tenantId: 'tenant-001',
      purchaseRequestId: 'pr-r2',
      inventoryItemId: 'item-1',
      quantityRequested: '2.00',
      lineStatus: PurchaseRequestLineStatus.AWARDED,
    };
    const awards = [
      {
        id: 'award-1',
        tenantId: 'tenant-001',
        purchaseRequestLineId: 'line-1',
        awardedPartyRefId: 'party-001',
        awardedQuantity: '2.00',
      },
    ];

    const { manager } = createOrderingHarness({ request: requestRecord, lines: [lineOne], awards });
    const service = createRegressionService(manager);

    // Primera orden parcial legítima: 1.5 de 2.00 adjudicadas.
    await service.createPurchaseOrderFromRequest(
      {
        purchaseRequestId: 'pr-r2',
        partyRefId: 'party-001',
        status: PurchaseOrderStatus.APPROVED,
        lines: [{ purchaseRequestLineId: 'line-1', itemId: 'item-1', quantity: 1.5, unitCost: 50 }],
      },
      actor,
    );

    // Segunda orden con 1.00 más: acumulado 2.50 > 2.00 → 400 ORDER_EXCEEDS_AWARD.
    await expect(
      service.createPurchaseOrderFromRequest(
        {
          purchaseRequestId: 'pr-r2',
          partyRefId: 'party-001',
          status: PurchaseOrderStatus.APPROVED,
          lines: [{ purchaseRequestLineId: 'line-1', itemId: 'item-1', quantity: 1, unitCost: 50 }],
        },
        actor,
      ),
    ).rejects.toMatchObject({ response: { code: 'ORDER_EXCEEDS_AWARD' } });
    expect(lineOne.lineStatus).toBe(PurchaseRequestLineStatus.AWARDED);
    expect(requestRecord.status).toBe(PurchaseRequestStatus.APPROVED);
  });

  it('R3: orden parcial deja la línea en AWARDED; al completar la cantidad adjudicada queda ORDERED', async () => {
    const requestRecord = {
      id: 'pr-r3',
      tenantId: 'tenant-001',
      status: PurchaseRequestStatus.APPROVED,
      neededByDate: null as string | null,
    };
    const lineOne = {
      id: 'line-1',
      tenantId: 'tenant-001',
      purchaseRequestId: 'pr-r3',
      inventoryItemId: 'item-1',
      quantityRequested: '2.00',
      lineStatus: PurchaseRequestLineStatus.AWARDED,
    };
    const awards = [
      {
        id: 'award-1',
        tenantId: 'tenant-001',
        purchaseRequestLineId: 'line-1',
        awardedPartyRefId: 'party-001',
        awardedQuantity: '2.00',
      },
    ];

    const { manager } = createOrderingHarness({ request: requestRecord, lines: [lineOne], awards });
    const service = createRegressionService(manager);

    await service.createPurchaseOrderFromRequest(
      {
        purchaseRequestId: 'pr-r3',
        partyRefId: 'party-001',
        status: PurchaseOrderStatus.APPROVED,
        lines: [{ purchaseRequestLineId: 'line-1', itemId: 'item-1', quantity: 1, unitCost: 50 }],
      },
      actor,
    );

    // Orden parcial: la línea permanece AWARDED (no ORDERED prematuro).
    expect(lineOne.lineStatus).toBe(PurchaseRequestLineStatus.AWARDED);
    expect(requestRecord.status).toBe(PurchaseRequestStatus.APPROVED);

    await service.createPurchaseOrderFromRequest(
      {
        purchaseRequestId: 'pr-r3',
        partyRefId: 'party-001',
        status: PurchaseOrderStatus.APPROVED,
        lines: [{ purchaseRequestLineId: 'line-1', itemId: 'item-1', quantity: 1, unitCost: 50 }],
      },
      actor,
    );

    // Adjudicación completada: ORDERED y, siendo la única línea, CONVERTED_TO_PO.
    expect(lineOne.lineStatus).toBe(PurchaseRequestLineStatus.ORDERED);
    expect(requestRecord.status).toBe(PurchaseRequestStatus.CONVERTED_TO_PO);
  });

  // ===== Fase 30 BE-2 — contrato de adjudicación (matriz, ADR-087 propuesto) =====

  function createAwardTestRequest(id: string, requestType: PurchaseRequestType) {
    return {
      id,
      tenantId: 'tenant-001',
      status: PurchaseRequestStatus.APPROVED,
      requestType,
    };
  }

  function createAwardTestLine(
    id: string,
    purchaseRequestId: string,
    lineStatus: PurchaseRequestLineStatus,
  ) {
    return {
      id,
      tenantId: 'tenant-001',
      purchaseRequestId,
      inventoryItemId: `item-${id}`,
      quantityRequested: '4.00',
      lineStatus,
    };
  }

  it('CA-304: cotización de otra solicitud responde 400 AWARD_QUOTE_MISMATCH', async () => {
    const request = createAwardTestRequest('pr-304a', PurchaseRequestType.REPLENISHMENT);
    const line = createAwardTestLine('line-304a', 'pr-304a', PurchaseRequestLineStatus.OPEN);
    const quote = {
      id: 'quote-otra',
      tenantId: 'tenant-001',
      purchaseRequestId: 'pr-otra',
      partyRefId: 'party-001',
      currency: 'COP',
    };
    const awards: Array<Record<string, unknown>> = [];
    const { manager } = createOrderingHarness({ request, lines: [line], awards, quote });
    const service = createRegressionService(manager);

    const error = await service
      .createLineAwards(
        'pr-304a',
        {
          awards: [
            {
              purchaseRequestLineId: 'line-304a',
              awardedPartyRefId: 'party-001',
              awardedQuantity: '2.00',
              supplierQuoteId: 'quote-otra',
            },
          ],
        },
        actor,
      )
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse()).toMatchObject({ code: 'AWARD_QUOTE_MISMATCH' });
    expect(awards).toHaveLength(0);
  });

  it('CA-304: cotización de otro proveedor responde 400 AWARD_SUPPLIER_MISMATCH', async () => {
    const request = createAwardTestRequest('pr-304b', PurchaseRequestType.REPLENISHMENT);
    const line = createAwardTestLine('line-304b', 'pr-304b', PurchaseRequestLineStatus.OPEN);
    const quote = {
      id: 'quote-304b',
      tenantId: 'tenant-001',
      purchaseRequestId: 'pr-304b',
      partyRefId: 'party-999',
      currency: 'COP',
    };
    const awards: Array<Record<string, unknown>> = [];
    const { manager } = createOrderingHarness({ request, lines: [line], awards, quote });
    const service = createRegressionService(manager);

    const error = await service
      .createLineAwards(
        'pr-304b',
        {
          awards: [
            {
              purchaseRequestLineId: 'line-304b',
              awardedPartyRefId: 'party-001',
              awardedQuantity: '2.00',
              supplierQuoteId: 'quote-304b',
            },
          ],
        },
        actor,
      )
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse()).toMatchObject({ code: 'AWARD_SUPPLIER_MISMATCH' });
    expect(awards).toHaveLength(0);
  });

  it('CA-304: cotización sin línea para el producto responde 400 AWARD_QUOTE_LINE_MISSING', async () => {
    const request = createAwardTestRequest('pr-304c', PurchaseRequestType.REPLENISHMENT);
    const line = createAwardTestLine('line-304c', 'pr-304c', PurchaseRequestLineStatus.OPEN);
    const quote = {
      id: 'quote-304c',
      tenantId: 'tenant-001',
      purchaseRequestId: 'pr-304c',
      partyRefId: 'party-001',
      currency: 'COP',
    };
    const awards: Array<Record<string, unknown>> = [];
    // Sin quoteLine en el harness: la cotización no cubre el producto.
    const { manager } = createOrderingHarness({ request, lines: [line], awards, quote });
    const service = createRegressionService(manager);

    const error = await service
      .createLineAwards(
        'pr-304c',
        {
          awards: [
            {
              purchaseRequestLineId: 'line-304c',
              awardedPartyRefId: 'party-001',
              awardedQuantity: '2.00',
              supplierQuoteId: 'quote-304c',
            },
          ],
        },
        actor,
      )
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse()).toMatchObject({ code: 'AWARD_QUOTE_LINE_MISSING' });
    expect(awards).toHaveLength(0);
  });

  it('CA-303: proveedor distinto sobre línea adjudicada en no-PROJECT responde 409 AWARD_PARTY_CONFLICT', async () => {
    const request = createAwardTestRequest('pr-303', PurchaseRequestType.REPLENISHMENT);
    const line = createAwardTestLine('line-303', 'pr-303', PurchaseRequestLineStatus.AWARDED);
    const awards = [
      {
        id: 'award-303',
        tenantId: 'tenant-001',
        purchaseRequestLineId: 'line-303',
        awardedPartyRefId: 'party-001',
        awardedQuantity: '4.00',
      },
    ];
    const { manager } = createOrderingHarness({ request, lines: [line], awards });
    const service = createRegressionService(manager);

    const error = await service
      .createLineAwards(
        'pr-303',
        {
          awards: [
            {
              purchaseRequestLineId: 'line-303',
              awardedPartyRefId: 'party-002',
              awardedQuantity: '2.00',
            },
          ],
        },
        actor,
      )
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toMatchObject({ code: 'AWARD_PARTY_CONFLICT' });
    expect(awards).toHaveLength(1);
    expect(awards[0]?.awardedPartyRefId).toBe('party-001');
  });

  it('CA-303: en PROJECT un proveedor distinto con cantidad restante es legítimo', async () => {
    const request = createAwardTestRequest('pr-303b', PurchaseRequestType.PROJECT);
    const line = createAwardTestLine('line-303b', 'pr-303b', PurchaseRequestLineStatus.AWARDED);
    const awards = [
      {
        id: 'award-303b',
        tenantId: 'tenant-001',
        purchaseRequestLineId: 'line-303b',
        awardedPartyRefId: 'party-001',
        awardedQuantity: '2.00',
      },
    ];
    const { manager } = createOrderingHarness({ request, lines: [line], awards });
    const service = createRegressionService(manager);

    const result = await service.createLineAwards(
      'pr-303b',
      {
        awards: [
          {
            purchaseRequestLineId: 'line-303b',
            awardedPartyRefId: 'party-002',
            awardedQuantity: '2.00',
          },
        ],
      },
      actor,
    );

    expect(result.awards).toHaveLength(1);
    expect(result.awards[0]).toEqual(
      expect.objectContaining({ awardedPartyRefId: 'party-002', awardedQuantity: '2.00' }),
    );
    expect(result.coverage).toBe(PurchaseRequestAwardCoverage.FULLY_AWARDED);
    expect(awards).toHaveLength(2);
    // La línea ya estaba AWARDED y no se degrada ni re-triuga.
    expect(line.lineStatus).toBe(PurchaseRequestLineStatus.AWARDED);
  });

  it('CA-306: reenviar el mismo payload es un NO-OP idempotente (un solo award)', async () => {
    const request = createAwardTestRequest('pr-306', PurchaseRequestType.REPLENISHMENT);
    const line = createAwardTestLine('line-306', 'pr-306', PurchaseRequestLineStatus.OPEN);
    const awards: Array<Record<string, unknown>> = [];
    const { manager } = createOrderingHarness({ request, lines: [line], awards });
    const service = createRegressionService(manager);
    const payload = {
      awards: [
        {
          purchaseRequestLineId: 'line-306',
          awardedPartyRefId: 'party-001',
          awardedQuantity: '4.00',
        },
      ],
    };

    const first = await service.createLineAwards('pr-306', payload, actor);
    expect(first.awards).toHaveLength(1);
    expect(first.coverage).toBe(PurchaseRequestAwardCoverage.FULLY_AWARDED);

    const second = await service.createLineAwards('pr-306', payload, actor);

    expect(second.awards).toHaveLength(1);
    expect(second.awards[0]?.id).toBe(first.awards[0]?.id);
    expect(second.coverage).toBe(PurchaseRequestAwardCoverage.FULLY_AWARDED);
    expect(awards).toHaveLength(1);
  });

  it('CA-306: misma cantidad y cotización con notas distintas actualiza solo las notas', async () => {
    const request = createAwardTestRequest('pr-306b', PurchaseRequestType.REPLENISHMENT);
    const line = createAwardTestLine('line-306b', 'pr-306b', PurchaseRequestLineStatus.OPEN);
    const awards: Array<Record<string, unknown>> = [];
    const { manager } = createOrderingHarness({ request, lines: [line], awards });
    const service = createRegressionService(manager);

    await service.createLineAwards(
      'pr-306b',
      {
        awards: [
          {
            purchaseRequestLineId: 'line-306b',
            awardedPartyRefId: 'party-001',
            awardedQuantity: '4.00',
            awardNotes: 'Nota original',
          },
        ],
      },
      actor,
    );

    const second = await service.createLineAwards(
      'pr-306b',
      {
        awards: [
          {
            purchaseRequestLineId: 'line-306b',
            awardedPartyRefId: 'party-001',
            awardedQuantity: '4.00',
            awardNotes: 'Nota corregida',
          },
        ],
      },
      actor,
    );

    expect(second.awards).toHaveLength(1);
    expect(awards).toHaveLength(1);
    expect(awards[0]?.awardNotes).toBe('Nota corregida');
    expect(awards[0]?.awardedQuantity).toBe('4.00');
  });

  it('CA-307: revoca sin orden viva y con cotizaciones reabre la línea en PENDING_QUOTE', async () => {
    const request = createAwardTestRequest('pr-307a', PurchaseRequestType.REPLENISHMENT);
    const line = createAwardTestLine('line-307a', 'pr-307a', PurchaseRequestLineStatus.AWARDED);
    const awards = [
      {
        id: 'award-307a',
        tenantId: 'tenant-001',
        purchaseRequestLineId: 'line-307a',
        awardedPartyRefId: 'party-001',
        awardedQuantity: '4.00',
      },
    ];
    const { manager } = createOrderingHarness({ request, lines: [line], awards, quoteCount: 2 });
    const service = createRegressionService(manager);

    const result = await service.revokeLineAward('pr-307a', 'award-307a', actor);

    expect(result).toEqual({
      awardId: 'award-307a',
      lineStatusAfter: PurchaseRequestLineStatus.PENDING_QUOTE,
      coverage: PurchaseRequestAwardCoverage.NOT_AWARDED,
    });
    expect(awards).toHaveLength(0);
    expect(line.lineStatus).toBe(PurchaseRequestLineStatus.PENDING_QUOTE);
  });

  it('CA-307: sin cotizaciones la línea reabre en OPEN aunque solo haya órdenes canceladas', async () => {
    const request = createAwardTestRequest('pr-307b', PurchaseRequestType.REPLENISHMENT);
    const line = createAwardTestLine('line-307b', 'pr-307b', PurchaseRequestLineStatus.AWARDED);
    const awards = [
      {
        id: 'award-307b',
        tenantId: 'tenant-001',
        purchaseRequestLineId: 'line-307b',
        awardedPartyRefId: 'party-001',
        awardedQuantity: '4.00',
      },
    ];
    const { manager, orders, orderLines } = createOrderingHarness({
      request,
      lines: [line],
      awards,
      quoteCount: 0,
    });
    // Una orden CANCELLED no es orden viva: no bloquea la revocación.
    orders.push({
      id: 'po-cancelled',
      tenantId: 'tenant-001',
      purchaseRequestId: 'pr-307b',
      partyRefId: 'party-001',
      status: PurchaseOrderStatus.CANCELLED,
    });
    orderLines.push({
      id: 'pol-cancelled',
      tenantId: 'tenant-001',
      purchaseOrderId: 'po-cancelled',
      purchaseRequestLineId: 'line-307b',
      quantity: '2.00',
    });
    const service = createRegressionService(manager);

    const result = await service.revokeLineAward('pr-307b', 'award-307b', actor);

    expect(result).toEqual({
      awardId: 'award-307b',
      lineStatusAfter: PurchaseRequestLineStatus.OPEN,
      coverage: PurchaseRequestAwardCoverage.NOT_AWARDED,
    });
    expect(line.lineStatus).toBe(PurchaseRequestLineStatus.OPEN);
  });

  it('CA-307: con orden de compra viva responde 409 AWARD_ALREADY_ORDERED y no borra', async () => {
    const request = createAwardTestRequest('pr-307c', PurchaseRequestType.REPLENISHMENT);
    const line = createAwardTestLine('line-307c', 'pr-307c', PurchaseRequestLineStatus.ORDERED);
    const awards = [
      {
        id: 'award-307c',
        tenantId: 'tenant-001',
        purchaseRequestLineId: 'line-307c',
        awardedPartyRefId: 'party-001',
        awardedQuantity: '4.00',
      },
    ];
    const { manager, orders, orderLines } = createOrderingHarness({
      request,
      lines: [line],
      awards,
    });
    orders.push({
      id: 'po-live',
      tenantId: 'tenant-001',
      purchaseRequestId: 'pr-307c',
      partyRefId: 'party-001',
      status: PurchaseOrderStatus.APPROVED,
    });
    orderLines.push({
      id: 'pol-live',
      tenantId: 'tenant-001',
      purchaseOrderId: 'po-live',
      purchaseRequestLineId: 'line-307c',
      quantity: '1.00',
    });
    const service = createRegressionService(manager);

    const error = await service
      .revokeLineAward('pr-307c', 'award-307c', actor)
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toMatchObject({ code: 'AWARD_ALREADY_ORDERED' });
    expect(awards).toHaveLength(1);
    expect(line.lineStatus).toBe(PurchaseRequestLineStatus.ORDERED);
  });

  it('CA-307: revocar un award de reparto PROJECT conserva la línea AWARDED si quedan otros awards', async () => {
    const request = createAwardTestRequest('pr-307d', PurchaseRequestType.PROJECT);
    const line = createAwardTestLine('line-307d', 'pr-307d', PurchaseRequestLineStatus.AWARDED);
    const awards = [
      {
        id: 'award-307d-1',
        tenantId: 'tenant-001',
        purchaseRequestLineId: 'line-307d',
        awardedPartyRefId: 'party-001',
        awardedQuantity: '2.00',
      },
      {
        id: 'award-307d-2',
        tenantId: 'tenant-001',
        purchaseRequestLineId: 'line-307d',
        awardedPartyRefId: 'party-002',
        awardedQuantity: '2.00',
      },
    ];
    const { manager } = createOrderingHarness({ request, lines: [line], awards });
    const service = createRegressionService(manager);

    const result = await service.revokeLineAward('pr-307d', 'award-307d-1', actor);

    expect(result).toEqual({
      awardId: 'award-307d-1',
      lineStatusAfter: PurchaseRequestLineStatus.AWARDED,
      coverage: PurchaseRequestAwardCoverage.FULLY_AWARDED,
    });
    expect(awards).toHaveLength(1);
    expect(line.lineStatus).toBe(PurchaseRequestLineStatus.AWARDED);
  });

  it('CA-308: el costo congelado del award prevalece y se aplica a la línea de la OC', async () => {
    const request = createAwardTestRequest('pr-308a', PurchaseRequestType.REPLENISHMENT);
    const line = createAwardTestLine('line-308a', 'pr-308a', PurchaseRequestLineStatus.AWARDED);
    const awards = [
      {
        id: 'award-308a',
        tenantId: 'tenant-001',
        purchaseRequestLineId: 'line-308a',
        awardedPartyRefId: 'party-001',
        awardedQuantity: '4.00',
        supplierQuoteId: null,
        unitCost: '150.00',
        currency: 'COP',
      },
    ];
    const { manager, orderLines } = createOrderingHarness({ request, lines: [line], awards });
    const service = createRegressionService(manager);

    await service.createPurchaseOrderFromRequest(
      {
        purchaseRequestId: 'pr-308a',
        partyRefId: 'party-001',
        status: PurchaseOrderStatus.APPROVED,
        lines: [
          {
            purchaseRequestLineId: 'line-308a',
            itemId: 'item-line-308a',
            quantity: 2,
            unitCost: 150,
          },
        ],
      },
      actor,
    );

    expect(orderLines[0]?.unitCost).toBe('150.00');
  });

  it('CA-308: sin snapshot el costo deriva de la línea de cotización del award', async () => {
    const request = createAwardTestRequest('pr-308b', PurchaseRequestType.REPLENISHMENT);
    const line = createAwardTestLine('line-308b', 'pr-308b', PurchaseRequestLineStatus.AWARDED);
    const awards = [
      {
        id: 'award-308b',
        tenantId: 'tenant-001',
        purchaseRequestLineId: 'line-308b',
        awardedPartyRefId: 'party-001',
        awardedQuantity: '4.00',
        supplierQuoteId: 'quote-308b',
        unitCost: null,
        currency: null,
      },
    ];
    const quoteLine = {
      id: 'ql-308b',
      tenantId: 'tenant-001',
      supplierQuoteId: 'quote-308b',
      purchaseRequestLineId: 'line-308b',
      unitCost: '77.50',
      lineAmount: '310.00',
    };
    const { manager, orderLines } = createOrderingHarness({
      request,
      lines: [line],
      awards,
      quoteLine,
    });
    const service = createRegressionService(manager);

    await service.createPurchaseOrderFromRequest(
      {
        purchaseRequestId: 'pr-308b',
        partyRefId: 'party-001',
        status: PurchaseOrderStatus.APPROVED,
        lines: [
          {
            purchaseRequestLineId: 'line-308b',
            itemId: 'item-line-308b',
            quantity: 2,
            unitCost: 77.5,
          },
        ],
      },
      actor,
    );

    expect(orderLines[0]?.unitCost).toBe('77.50');
  });

  it('CA-308: divergencia del cliente mayor a un céntimo responde 400 UNIT_COST_MISMATCH', async () => {
    const request = createAwardTestRequest('pr-308c', PurchaseRequestType.REPLENISHMENT);
    const line = createAwardTestLine('line-308c', 'pr-308c', PurchaseRequestLineStatus.AWARDED);
    const awards = [
      {
        id: 'award-308c',
        tenantId: 'tenant-001',
        purchaseRequestLineId: 'line-308c',
        awardedPartyRefId: 'party-001',
        awardedQuantity: '4.00',
        supplierQuoteId: null,
        unitCost: '150.00',
        currency: 'COP',
      },
    ];
    const { manager, orderLines } = createOrderingHarness({ request, lines: [line], awards });
    const service = createRegressionService(manager);

    const error = await service
      .createPurchaseOrderFromRequest(
        {
          purchaseRequestId: 'pr-308c',
          partyRefId: 'party-001',
          status: PurchaseOrderStatus.APPROVED,
          lines: [
            {
              purchaseRequestLineId: 'line-308c',
              itemId: 'item-line-308c',
              quantity: 1,
              unitCost: 151,
            },
          ],
        },
        actor,
      )
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse()).toMatchObject({ code: 'UNIT_COST_MISMATCH' });
    expect(orderLines).toHaveLength(0);
  });

  it('CA-308: la escotilla sin cotización acepta el costo que envía el cliente', async () => {
    const request = createAwardTestRequest('pr-308d', PurchaseRequestType.REPLENISHMENT);
    const line = createAwardTestLine('line-308d', 'pr-308d', PurchaseRequestLineStatus.AWARDED);
    const awards = [
      {
        id: 'award-308d',
        tenantId: 'tenant-001',
        purchaseRequestLineId: 'line-308d',
        awardedPartyRefId: 'party-001',
        awardedQuantity: '4.00',
        supplierQuoteId: null,
        unitCost: null,
        currency: null,
      },
    ];
    const { manager, orderLines } = createOrderingHarness({ request, lines: [line], awards });
    const service = createRegressionService(manager);

    await service.createPurchaseOrderFromRequest(
      {
        purchaseRequestId: 'pr-308d',
        partyRefId: 'party-001',
        status: PurchaseOrderStatus.APPROVED,
        lines: [
          {
            purchaseRequestLineId: 'line-308d',
            itemId: 'item-line-308d',
            quantity: 1,
            unitCost: 80,
          },
        ],
      },
      actor,
    );

    expect(orderLines[0]?.unitCost).toBe('80.00');
  });

  it('CA-308: sin costo congelado, sin cotización y sin valor del cliente no crea línea con costo 0', async () => {
    const request = createAwardTestRequest('pr-308e', PurchaseRequestType.REPLENISHMENT);
    const line = createAwardTestLine('line-308e', 'pr-308e', PurchaseRequestLineStatus.AWARDED);
    const awards = [
      {
        id: 'award-308e',
        tenantId: 'tenant-001',
        purchaseRequestLineId: 'line-308e',
        awardedPartyRefId: 'party-001',
        awardedQuantity: '4.00',
        supplierQuoteId: null,
        unitCost: null,
        currency: null,
      },
    ];
    const { manager, orderLines } = createOrderingHarness({ request, lines: [line], awards });
    const service = createRegressionService(manager);

    await expect(
      service.createPurchaseOrderFromRequest(
        {
          purchaseRequestId: 'pr-308e',
          partyRefId: 'party-001',
          status: PurchaseOrderStatus.APPROVED,
          lines: [{ purchaseRequestLineId: 'line-308e', itemId: 'item-line-308e', quantity: 1 }],
        },
        actor,
      ),
    ).rejects.toThrow('indica el costo unitario');
    expect(orderLines).toHaveLength(0);
  });

  it('adenda §12.5: la escotilla congela el costo aportado como snapshot del award', async () => {
    const request = createAwardTestRequest('pr-309', PurchaseRequestType.REPLENISHMENT);
    const line = createAwardTestLine('line-309', 'pr-309', PurchaseRequestLineStatus.OPEN);
    const awards: Array<Record<string, unknown>> = [];
    const { manager } = createOrderingHarness({ request, lines: [line], awards });
    const service = createRegressionService(manager);

    const result = await service.createLineAwards(
      'pr-309',
      {
        awards: [
          {
            purchaseRequestLineId: 'line-309',
            awardedPartyRefId: 'party-001',
            awardedQuantity: '4.00',
            unitCost: '150.00',
          },
        ],
      },
      actor,
    );

    expect(result.awards[0]).toMatchObject({
      unitCost: '150.00',
      currency: null,
      supplierQuoteId: null,
    });
    expect(awards[0]).toMatchObject({ unitCost: '150.00' });
  });

  it('adenda §12.5: reenvío de escotilla con costo corregido actualiza el snapshot (no es no-op)', async () => {
    const request = createAwardTestRequest('pr-309b', PurchaseRequestType.REPLENISHMENT);
    const line = createAwardTestLine('line-309b', 'pr-309b', PurchaseRequestLineStatus.OPEN);
    const awards: Array<Record<string, unknown>> = [];
    const { manager } = createOrderingHarness({ request, lines: [line], awards });
    const service = createRegressionService(manager);
    const base = {
      purchaseRequestLineId: 'line-309b',
      awardedPartyRefId: 'party-001',
      awardedQuantity: '4.00',
    };

    await service.createLineAwards('pr-309b', { awards: [{ ...base, unitCost: '150.00' }] }, actor);
    const second = await service.createLineAwards(
      'pr-309b',
      { awards: [{ ...base, unitCost: '160.00' }] },
      actor,
    );

    expect(second.awards).toHaveLength(1);
    expect(second.awards[0]?.unitCost).toBe('160.00');
    expect(awards).toHaveLength(1);
  });

  it('adenda §12.5: award con cotización y costo del cliente divergente responde 400 UNIT_COST_MISMATCH', async () => {
    const request = createAwardTestRequest('pr-309c', PurchaseRequestType.REPLENISHMENT);
    const line = createAwardTestLine('line-309c', 'pr-309c', PurchaseRequestLineStatus.OPEN);
    const quote = {
      id: 'quote-309c',
      tenantId: 'tenant-001',
      purchaseRequestId: 'pr-309c',
      partyRefId: 'party-001',
      currency: 'COP',
    };
    const quoteLine = {
      id: 'ql-309c',
      tenantId: 'tenant-001',
      supplierQuoteId: 'quote-309c',
      purchaseRequestLineId: 'line-309c',
      unitCost: '77.50',
      lineAmount: '310.00',
    };
    const { manager } = createOrderingHarness({
      request,
      lines: [line],
      awards: [],
      quote,
      quoteLine,
    });
    const service = createRegressionService(manager);

    const error = await service
      .createLineAwards(
        'pr-309c',
        {
          awards: [
            {
              purchaseRequestLineId: 'line-309c',
              supplierQuoteId: 'quote-309c',
              awardedPartyRefId: 'party-001',
              awardedQuantity: '4.00',
              unitCost: '80.00',
            },
          ],
        },
        actor,
      )
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse()).toMatchObject({ code: 'UNIT_COST_MISMATCH' });
  });

  it('adenda §12.5: la orden desde un award de escotilla usa el snapshot sin exigir costo del cliente', async () => {
    const request = createAwardTestRequest('pr-309d', PurchaseRequestType.REPLENISHMENT);
    const line = createAwardTestLine('line-309d', 'pr-309d', PurchaseRequestLineStatus.AWARDED);
    const awards = [
      {
        id: 'award-309d',
        tenantId: 'tenant-001',
        purchaseRequestLineId: 'line-309d',
        awardedPartyRefId: 'party-001',
        awardedQuantity: '4.00',
        supplierQuoteId: null,
        unitCost: '150.00',
        currency: null,
      },
    ];
    const { manager, orderLines } = createOrderingHarness({ request, lines: [line], awards });
    const service = createRegressionService(manager);

    await service.createPurchaseOrderFromRequest(
      {
        purchaseRequestId: 'pr-309d',
        partyRefId: 'party-001',
        status: PurchaseOrderStatus.APPROVED,
        lines: [{ purchaseRequestLineId: 'line-309d', itemId: 'item-line-309d', quantity: 2 }],
      },
      actor,
    );

    expect(orderLines[0]?.unitCost).toBe('150.00');
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
        .mockResolvedValueOnce([])
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
      emptyTaxCatalogPort,
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
    expect(result.quotes[0]?.taxes).toEqual([]);
    expect(result.quotes[0]?.payableAmount).toBe('100000.00');
    expect(result.purchaseTaxPresets).toEqual([]);
  });

  it('estimatedAmount de aprobación no incluye IVA (CA-25-09)', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'pr-policy',
        tenantId: 'tenant-001',
        requestNumber: 'PR-000099',
        requestType: PurchaseRequestType.REPLENISHMENT,
        exceptionReason: null,
        justification: 'Reposición preventiva de equipos de acceso para cuadrillas.',
      }),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      }),
      find: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: 'quote-iva',
            tenantId: 'tenant-001',
            purchaseRequestId: 'pr-policy',
            amount: '490000',
            shippingCost: '0',
            payableAmount: '583100.00',
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
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
      emptyTaxCatalogPort,
    );

    const result = await service.getRequestDetail('pr-policy');

    expect(result.estimatedAmount).toBe(490000);
    expect(result.approvalPolicy.approvalLevel).toBe('BUYER');
    expect(result.quotes[0]?.payableAmount).toBe('583100.00');
  });

  it('CA-25-11: GET detail expone presets PURCHASE del catálogo', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'pr-presets',
        tenantId: 'tenant-001',
        requestNumber: 'PR-000025',
        requestType: PurchaseRequestType.REPLENISHMENT,
        exceptionReason: null,
        justification: 'Reposición preventiva de equipos de acceso para cuadrillas.',
      }),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      }),
      find: jest.fn().mockResolvedValue([]),
    };
    const supplierPartyPort: jest.Mocked<SupplierPartyPort> = {
      getSupplierSummary: jest.fn(),
      getSupplierSummariesBatch: jest.fn().mockResolvedValue(new Map()),
      searchSuppliers: jest.fn(),
    } as never;
    const catalogPort = {
      ...emptyTaxCatalogPort,
      listByContext: jest.fn().mockResolvedValue([
        {
          id: 'def-iva',
          code: 'IVA_19',
          name: 'IVA 19%',
          category: TaxCategory.VAT,
          baseRate: '19',
          treatment: TaxTreatment.STANDARD,
          context: TaxContext.BOTH,
          isActive: true,
        },
        {
          id: 'def-rete-iva',
          code: 'RETE_IVA',
          name: 'Rete IVA',
          category: TaxCategory.WITHHOLDING,
          baseRate: '15',
          treatment: TaxTreatment.STANDARD,
          context: TaxContext.PURCHASE,
          isActive: true,
        },
      ]),
    } as unknown as TaxCatalogReadPort;

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));
    const service = new PurchasingQueryService(
      {} as DataSource,
      supplierPartyPort,
      new PurchasingPolicyService(),
      catalogPort,
    );

    const result = await service.getRequestDetail('pr-presets');

    expect(catalogPort.listByContext).toHaveBeenCalledWith(TaxContext.PURCHASE);
    expect(result.purchaseTaxPresets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'IVA_19',
          name: 'IVA 19%',
          baseRate: 19,
          context: TaxContext.BOTH,
        }),
        expect.objectContaining({
          code: 'RETE_IVA',
          name: 'Rete IVA',
          baseRate: 15,
          context: TaxContext.PURCHASE,
        }),
      ]),
    );
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
      emptyTaxCatalogPort,
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
      emptyTaxCatalogPort,
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
      emptyTaxCatalogPort,
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
