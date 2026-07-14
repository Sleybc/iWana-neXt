import { ForbiddenException, INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { runInTenantSchema } from '@iwana/db';
import {
  PartyStatus,
  PurchaseOrderStatus,
  PurchaseRequestLineSourceKind,
  PurchaseRequestPriority,
  PurchaseRequestStatus,
  PurchaseRequestType,
  PurchaseRfqInvitationStatus,
  PurchaseRfqStatus,
  UserRole,
} from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { SupplierPartyPort } from '../ports/supplier-party.port';
import { PurchasingController } from '../purchasing.controller';
import { GoodsReceiptService } from '../services/goods-receipt.service';
import { PurchasingPolicyService } from '../services/purchasing-policy.service';
import { PurchasingQueryService } from '../services/purchasing-query.service';
import { PurchasingService } from '../services/purchasing.service';
import { RfqPdfService } from '../services/rfq-pdf.service';
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
  SupplierQuote: class SupplierQuote {},
  PurchaseOrder: class PurchaseOrder {},
  PurchaseOrderLine: class PurchaseOrderLine {},
  GoodsReceipt: class GoodsReceipt {},
  GoodsReceiptLine: class GoodsReceiptLine {},
  InventoryItem: class InventoryItem {},
  StockLot: class StockLot {},
  PurchaseRequestLine: class PurchaseRequestLine {},
  PurchaseRfq: class PurchaseRfq {},
  PurchaseRfqInvitation: class PurchaseRfqInvitation {},
}));

jest.mock('../../auth/guards/jwt-auth.guard', () => ({
  JwtAuthGuard: class JwtAuthGuard {
    canActivate(context: {
      getHandler: () => unknown;
      getClass: () => unknown;
      switchToHttp: () => {
        getRequest: () => {
          headers: Record<string, string | undefined>;
          user?: JwtPayload;
        };
      };
    }): boolean {
      const handler = context.getHandler() as object;
      const classRef = context.getClass() as object;
      const isPublic =
        Reflect.getMetadata(IS_PUBLIC_KEY, handler) ?? Reflect.getMetadata(IS_PUBLIC_KEY, classRef);

      if (isPublic) {
        return true;
      }

      const req = context.switchToHttp().getRequest();
      if (req.headers.authorization === 'Bearer support-token') {
        req.user = {
          sub: 'support-001',
          email: 'support@example.test',
          role: UserRole.SUPPORT,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          jti: 'jti-support',
          type: 'tenant',
        } as JwtPayload;
        return true;
      }

      throw new UnauthorizedException('Token de acceso invalido o expirado.');
    }
  },
}));

jest.mock('../../auth/guards/roles.guard', () => ({
  RolesGuard: class RolesGuard {
    canActivate(context: {
      switchToHttp: () => { getRequest: () => { user?: JwtPayload } };
      getHandler: () => unknown;
      getClass: () => unknown;
    }): boolean {
      const user = context.switchToHttp().getRequest().user;
      const requiredRoles: string[] =
        Reflect.getMetadata('roles', context.getHandler() as object) ??
        Reflect.getMetadata('roles', context.getClass() as object) ??
        [];

      if (requiredRoles.length === 0 || (user && requiredRoles.includes(user.role))) {
        return true;
      }

      throw new ForbiddenException('No tiene permisos para ejecutar esta accion.');
    }
  },
}));

/**
 * Contrato HTTP tenant-aware de compras usando servicios reales y persistencia en memoria.
 * Cierra DT-INV-04 validando el backend sin depender de mocks por endpoint.
 */
describe('Purchasing HTTP integration (tenant-aware)', () => {
  let app: INestApplication;
  const mockRunInTenantSchema = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;
  const supplierPartyPortMock: jest.Mocked<SupplierPartyPort> = {
    getSupplierSummary: jest.fn(),
    getSupplierSummariesBatch: jest.fn(),
    searchSuppliers: jest.fn(),
  } as never;

  const state = {
    requests: [] as Array<Record<string, unknown>>,
    requestLines: [] as Array<Record<string, unknown>>,
    quotes: [] as Array<Record<string, unknown>>,
    orders: [] as Array<Record<string, unknown>>,
    orderLines: [] as Array<Record<string, unknown>>,
    rfqs: [] as Array<Record<string, unknown>>,
    rfqInvitations: [] as Array<Record<string, unknown>>,
    nextRequest: 1,
    nextRequestLine: 1,
    nextQuote: 1,
    nextOrder: 1,
    nextLine: 1,
  };

  const cancelActiveForRequest = jest
    .fn()
    .mockImplementation(
      async (
        _manager: unknown,
        _tenantId: string,
        purchaseRequestId: string,
        actor: JwtPayload,
      ) => {
        const activeRfq = state.rfqs.find(
          (rfq) =>
            rfq.purchaseRequestId === purchaseRequestId &&
            [PurchaseRfqStatus.DRAFT, PurchaseRfqStatus.SENT, PurchaseRfqStatus.RECEIVING].includes(
              rfq.status as PurchaseRfqStatus,
            ),
        );
        if (!activeRfq) {
          return;
        }

        activeRfq.status = PurchaseRfqStatus.CANCELLED;
        activeRfq.closedAt = new Date();
        activeRfq.closedByUserId = actor.sub;

        for (const invitation of state.rfqInvitations) {
          if (
            invitation.rfqId === activeRfq.id &&
            invitation.status === PurchaseRfqInvitationStatus.INVITED
          ) {
            invitation.status = PurchaseRfqInvitationStatus.CANCELLED;
          }
        }
      },
    );

  function nextRequestId(): string {
    const suffix = String(state.nextRequest++).padStart(12, '0');
    return `11111111-1111-4111-8111-${suffix}`;
  }

  function nextOrderId(): string {
    const suffix = String(state.nextOrder++).padStart(12, '0');
    return `22222222-2222-4222-8222-${suffix}`;
  }

  function nextRequestLineId(): string {
    const suffix = String(state.nextRequestLine++).padStart(12, '0');
    return `66666666-6666-4666-8666-${suffix}`;
  }

  function nextQuoteId(): string {
    const suffix = String(state.nextQuote++).padStart(12, '0');
    return `77777777-7777-4777-8777-${suffix}`;
  }

  function nextLineId(): string {
    const suffix = String(state.nextLine++).padStart(12, '0');
    return `33333333-3333-4333-8333-${suffix}`;
  }

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
        getOne: jest.fn().mockResolvedValue(null),
        getRawOne: jest.fn().mockResolvedValue({ maxValue: null }),
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
          const saved = { id: nextRequestId(), ...payload };
          state.requests.push(saved);
          return saved;
        }

        if (payload.id && payload.status && !payload.orderNumber && !payload.purchaseOrderId) {
          const requestIndex = state.requests.findIndex((entry) => entry.id === payload.id);
          if (requestIndex >= 0) {
            state.requests[requestIndex] = { ...state.requests[requestIndex], ...payload };
            return state.requests[requestIndex];
          }
        }

        if (payload.id) {
          const lineIndex = state.requestLines.findIndex((entry) => entry.id === payload.id);
          if (lineIndex >= 0) {
            state.requestLines[lineIndex] = { ...state.requestLines[lineIndex], ...payload };
            return state.requestLines[lineIndex];
          }
        }

        if (payload.orderNumber) {
          const saved = { id: nextOrderId(), ...payload };
          state.orders.push(saved);
          return saved;
        }

        if (payload.purchaseRequestId && payload.quantityRequested) {
          const saved = { id: nextRequestLineId(), ...payload };
          state.requestLines.push(saved);
          return saved;
        }

        if (payload.purchaseRequestId && payload.partyRefId && payload.quoteNumber) {
          const saved = { id: nextQuoteId(), ...payload };
          state.quotes.push(saved);
          return saved;
        }

        if (payload.purchaseOrderId && payload.itemId) {
          const saved = { id: nextLineId(), ...payload };
          state.orderLines.push(saved);
          return saved;
        }

        return payload;
      }),
      findOne: jest.fn().mockImplementation(async (_entity, options) => {
        const id = options?.where?.id;
        return (
          state.requests.find((entry) => entry.id === id) ??
          state.requestLines.find((entry) => entry.id === id) ??
          state.orders.find((entry) => entry.id === id) ??
          null
        );
      }),
      find: jest.fn().mockImplementation(async (entity, options) => {
        if (options?.where?.purchaseRequestId) {
          if (!entity?.name || entity.name === 'PurchaseRequestLine') {
            return state.requestLines.filter(
              (line) => line.purchaseRequestId === options.where.purchaseRequestId,
            );
          }

          if (entity?.name === 'SupplierQuote') {
            return state.quotes.filter(
              (quote) => quote.purchaseRequestId === options.where.purchaseRequestId,
            );
          }

          if (entity?.name === 'PurchaseOrder') {
            return state.orders.filter(
              (order) => order.purchaseRequestId === options.where.purchaseRequestId,
            );
          }
        }
        if (options?.where?.purchaseOrderId) {
          return state.orderLines.filter(
            (line) => line.purchaseOrderId === options.where.purchaseOrderId,
          );
        }
        return [];
      }),
    };
  }

  beforeAll(async () => {
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
      fn({ manager: createManager() } as never),
    );

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [PurchasingController],
      providers: [
        PurchasingService,
        PurchasingPolicyService,
        PurchasingQueryService,
        {
          provide: RfqService,
          useValue: { applyQuoteToInvitation: jest.fn(), cancelActiveForRequest },
        },
        { provide: RfqPdfService, useValue: { renderOrThrow: jest.fn() } },
        {
          provide: SupplierProfileService,
          useValue: { assertEligibleForPurchasing: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: SupplierPartyPort, useValue: supplierPartyPortMock },
        { provide: GoodsReceiptService, useValue: { receivePurchaseOrder: jest.fn() } },
        { provide: DataSource, useValue: {} },
        JwtAuthGuard,
        RolesGuard,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(() => {
    state.requests = [];
    state.requestLines = [];
    state.quotes = [];
    state.orders = [];
    state.orderLines = [];
    state.rfqs = [];
    state.rfqInvitations = [];
    state.nextRequest = 1;
    state.nextRequestLine = 1;
    state.nextQuote = 1;
    state.nextOrder = 1;
    state.nextLine = 1;
    jest.clearAllMocks();
    cancelActiveForRequest.mockImplementation(
      async (
        _manager: unknown,
        _tenantId: string,
        purchaseRequestId: string,
        actor: JwtPayload,
      ) => {
        const activeRfq = state.rfqs.find(
          (rfq) =>
            rfq.purchaseRequestId === purchaseRequestId &&
            [PurchaseRfqStatus.DRAFT, PurchaseRfqStatus.SENT, PurchaseRfqStatus.RECEIVING].includes(
              rfq.status as PurchaseRfqStatus,
            ),
        );
        if (!activeRfq) {
          return;
        }

        activeRfq.status = PurchaseRfqStatus.CANCELLED;
        activeRfq.closedAt = new Date();
        activeRfq.closedByUserId = actor.sub;

        for (const invitation of state.rfqInvitations) {
          if (
            invitation.rfqId === activeRfq.id &&
            invitation.status === PurchaseRfqInvitationStatus.INVITED
          ) {
            invitation.status = PurchaseRfqInvitationStatus.CANCELLED;
          }
        }
      },
    );
    supplierPartyPortMock.getSupplierSummary.mockResolvedValue({
      partyRefId: '55555555-5555-4555-8555-555555555555',
      displayName: 'Proveedor demo',
      primaryContact: 'Mesa comercial',
      phone: '3000000000',
      email: 'compras@proveedor.test',
      city: 'Bogotá',
      status: PartyStatus.ACTIVE,
    });
    supplierPartyPortMock.getSupplierSummariesBatch.mockResolvedValue(
      new Map([
        [
          '55555555-5555-4555-8555-555555555555',
          {
            partyRefId: '55555555-5555-4555-8555-555555555555',
            displayName: 'Proveedor demo',
            primaryContact: 'Mesa comercial',
            phone: '3000000000',
            email: 'compras@proveedor.test',
            city: 'Bogotá',
            status: PartyStatus.ACTIVE,
          },
        ],
      ]),
    );
    supplierPartyPortMock.searchSuppliers.mockResolvedValue({
      data: [
        {
          partyRefId: '55555555-5555-4555-8555-555555555555',
          displayName: 'Proveedor demo',
          status: PartyStatus.ACTIVE,
        },
      ],
      total: 1,
      page: 2,
      limit: 20,
    });
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
      fn({ manager: createManager() } as never),
    );
  });

  it('expone el ciclo HTTP solicitud -> aprobación -> OC -> detalle con líneas', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/purchasing/requests')
      .set('Authorization', 'Bearer support-token')
      .send({
        title: 'Reposición ONT',
        requestType: PurchaseRequestType.REPLENISHMENT,
        priority: PurchaseRequestPriority.HIGH,
        requestingArea: 'Operaciones',
        justification: 'Reposición preventiva para evitar quiebre de stock en cuadrillas.',
        neededByDate: '2026-07-15',
        lines: [
          {
            sourceKind: PurchaseRequestLineSourceKind.INVENTORY_ITEM,
            inventoryItemId: '44444444-4444-4444-8444-444444444444',
            quantityRequested: 4,
            unitOfMeasure: 'unidad',
          },
        ],
      })
      .expect(201);

    const requestId = created.body.id as string;
    expect(created.body.status).toBe(PurchaseRequestStatus.PENDING_QUOTES);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/purchasing/requests/${requestId}`)
      .set('Authorization', 'Bearer support-token')
      .expect(200);

    expect(detail.body.request.id).toBe(requestId);
    expect(detail.body.lines).toHaveLength(1);

    await request(app.getHttpServer())
      .post(`/api/v1/purchasing/requests/${requestId}/approve`)
      .set('Authorization', 'Bearer support-token')
      .send({ exceptionReason: 'Urgencia operativa de prueba no aplica aquí.' })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/api/v1/purchasing/requests/${requestId}/quotes`)
      .set('Authorization', 'Bearer support-token')
      .send({
        partyRefId: '55555555-5555-4555-8555-555555555555',
        quoteNumber: 'Q-HTTP-001',
        amount: 480000,
        currency: 'cop',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/purchasing/requests/${requestId}/approve`)
      .set('Authorization', 'Bearer support-token')
      .send({ notes: 'Aprobada en prueba HTTP' })
      .expect(201);

    const orderResponse = await request(app.getHttpServer())
      .post('/api/v1/purchasing/orders')
      .set('Authorization', 'Bearer support-token')
      .send({
        purchaseRequestId: requestId,
        partyRefId: 'party-001',
        lines: [
          {
            itemId: '44444444-4444-4444-8444-444444444444',
            quantity: 4,
            unitCost: 120000,
          },
        ],
        status: PurchaseOrderStatus.APPROVED,
      })
      .expect(201);

    const orderId = orderResponse.body.id as string;
    expect(orderResponse.body.orderNumber).toMatch(/^PO-/);

    const orderDetail = await request(app.getHttpServer())
      .get(`/api/v1/purchasing/orders/${orderId}`)
      .set('Authorization', 'Bearer support-token')
      .expect(200);

    expect(orderDetail.body.lines).toHaveLength(1);
    expect(orderDetail.body.lines[0].itemId).toBe('44444444-4444-4444-8444-444444444444');

    const listed = await request(app.getHttpServer())
      .get(`/api/v1/purchasing/orders?purchaseRequestId=${requestId}`)
      .set('Authorization', 'Bearer support-token')
      .expect(200);

    expect(listed.body).toHaveLength(1);
    expect(listed.body[0].id).toBe(orderId);

    const providerSummary = await request(app.getHttpServer())
      .get('/api/v1/purchasing/providers/55555555-5555-4555-8555-555555555555/summary')
      .set('Authorization', 'Bearer support-token')
      .expect(200);

    expect(providerSummary.body.displayName).toBe('Proveedor demo');
  });

  it('expone búsqueda paginada de proveedores para compras', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/purchasing/providers?search=demo&page=2')
      .set('Authorization', 'Bearer support-token')
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        total: 1,
        page: 2,
        limit: 20,
      }),
    );
    expect(response.body.data).toEqual([
      expect.objectContaining({
        partyRefId: '55555555-5555-4555-8555-555555555555',
        displayName: 'Proveedor demo',
        status: PartyStatus.ACTIVE,
      }),
    ]);
    expect(supplierPartyPortMock.searchSuppliers).toHaveBeenCalledWith('demo', 2);
  });

  it('rechaza solicitud PENDING_QUOTES y cancela la RFQ activa con invitaciones INVITED', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/purchasing/requests')
      .set('Authorization', 'Bearer support-token')
      .send({
        title: 'Reposición con RFQ a rechazar',
        requestType: PurchaseRequestType.REPLENISHMENT,
        priority: PurchaseRequestPriority.HIGH,
        requestingArea: 'Operaciones',
        justification: 'Solicitud de prueba para rechazo con cascada de cotización.',
        neededByDate: '2026-08-01',
        lines: [
          {
            sourceKind: PurchaseRequestLineSourceKind.INVENTORY_ITEM,
            inventoryItemId: '44444444-4444-4444-8444-444444444444',
            quantityRequested: 2,
            unitOfMeasure: 'unidad',
          },
        ],
      })
      .expect(201);

    const requestId = created.body.id as string;
    state.rfqs.push({
      id: '99999999-9999-4999-8999-999999999991',
      tenantId: 'tenant-001',
      purchaseRequestId: requestId,
      status: PurchaseRfqStatus.SENT,
    });
    state.rfqInvitations.push({
      id: '99999999-9999-4999-8999-999999999992',
      tenantId: 'tenant-001',
      rfqId: '99999999-9999-4999-8999-999999999991',
      partyRefId: '55555555-5555-4555-8555-555555555555',
      status: PurchaseRfqInvitationStatus.INVITED,
    });

    const rejected = await request(app.getHttpServer())
      .post(`/api/v1/purchasing/requests/${requestId}/reject`)
      .set('Authorization', 'Bearer support-token')
      .send({ reason: 'Cotizaciones fuera de presupuesto' })
      .expect(201);

    expect(rejected.body.status).toBe(PurchaseRequestStatus.REJECTED);
    expect(rejected.body.resolutionReason).toBe('Cotizaciones fuera de presupuesto');
    expect(rejected.body.resolvedByUserId).toBe('support-001');
    expect(cancelActiveForRequest).toHaveBeenCalled();
    expect(state.rfqs).toHaveLength(1);
    expect(state.rfqInvitations).toHaveLength(1);
    expect(state.rfqs[0]?.status).toBe(PurchaseRfqStatus.CANCELLED);
    expect(state.rfqInvitations[0]?.status).toBe(PurchaseRfqInvitationStatus.CANCELLED);
  });

  it('bloquea cancelación cuando la solicitud ya está convertida a OC', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/purchasing/requests')
      .set('Authorization', 'Bearer support-token')
      .send({
        title: 'Solicitud ya convertida a OC',
        requestType: PurchaseRequestType.REPLENISHMENT,
        priority: PurchaseRequestPriority.LOW,
        requestingArea: 'Operaciones',
        justification: 'Solicitud de prueba para denegar cancelación tras conversión a OC.',
        neededByDate: '2026-08-15',
        lines: [
          {
            sourceKind: PurchaseRequestLineSourceKind.INVENTORY_ITEM,
            inventoryItemId: '44444444-4444-4444-8444-444444444444',
            quantityRequested: 1,
            unitOfMeasure: 'unidad',
          },
        ],
      })
      .expect(201);

    const requestId = created.body.id as string;
    const requestIndex = state.requests.findIndex((entry) => entry.id === requestId);
    state.requests[requestIndex] = {
      ...state.requests[requestIndex],
      status: PurchaseRequestStatus.CONVERTED_TO_PO,
    };

    const response = await request(app.getHttpServer())
      .post(`/api/v1/purchasing/requests/${requestId}/cancel`)
      .set('Authorization', 'Bearer support-token')
      .send({ reason: 'Ya no aplica' })
      .expect(400);

    expect(response.body.message).toEqual(
      expect.stringContaining('no está en un estado que permita cancelarla'),
    );
  });
});
