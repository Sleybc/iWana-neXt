import { ForbiddenException, INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { runInTenantSchema } from '@iwana/db';
import {
  PartyStatus,
  PurchaseOrderStatus,
  PurchaseRequestLineSourceKind,
  PurchaseRequestLineStatus,
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
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { SupplierPartyPort } from '../ports/supplier-party.port';
import { PurchasingController } from '../purchasing.controller';
import { TaxCatalogReadPort } from '../../taxation/ports/tax-catalog-read.port';
import { GoodsReceiptService } from '../services/goods-receipt.service';
import { PurchasingPolicyService } from '../services/purchasing-policy.service';
import { PurchasingQueryService } from '../services/purchasing-query.service';
import { PurchasingService } from '../services/purchasing.service';
import { RfqPdfService } from '../services/rfq-pdf.service';
import { PurchaseOrderPdfService } from '../services/purchase-order-pdf.service';
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
  SupplierQuoteLine: class SupplierQuoteLine {},
  SupplierQuoteTax: class SupplierQuoteTax {},
  PurchaseOrder: class PurchaseOrder {},
  PurchaseOrderLine: class PurchaseOrderLine {},
  PurchaseRequestLineAward: class PurchaseRequestLineAward {},
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
      // Fase 30 BE-2: token de AUDITOR para probar autorización MANAGE (403).
      const tokens: Record<string, JwtPayload> = {
        'Bearer support-token': {
          sub: 'support-001',
          email: 'support@example.test',
          role: UserRole.SUPPORT,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          jti: 'jti-support',
          type: 'tenant',
        },
        'Bearer auditor-token': {
          sub: 'auditor-001',
          email: 'auditor@example.test',
          role: UserRole.AUDITOR,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          jti: 'jti-auditor',
          type: 'tenant',
        },
      };
      const user = tokens[req.headers.authorization ?? ''];
      if (user) {
        req.user = user;
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
    awards: [] as Array<Record<string, unknown>>,
    orders: [] as Array<Record<string, unknown>>,
    orderLines: [] as Array<Record<string, unknown>>,
    rfqs: [] as Array<Record<string, unknown>>,
    rfqInvitations: [] as Array<Record<string, unknown>>,
    nextRequest: 1,
    nextRequestLine: 1,
    nextQuote: 1,
    nextAward: 1,
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

  function nextAwardId(): string {
    const suffix = String(state.nextAward++).padStart(12, '0');
    return `88888888-8888-4888-8888-${suffix}`;
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
      createQueryBuilder: jest.fn().mockImplementation((_entity, alias) => {
        const resolveData = () => {
          if (alias === 'request') {
            return [...state.requests];
          }
          if (alias === 'purchaseOrder') {
            return [...state.orders];
          }
          return [];
        };
        return {
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          addOrderBy: jest.fn().mockReturnThis(),
          skip: jest.fn().mockReturnThis(),
          take: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(null),
          getRawOne: jest.fn().mockResolvedValue({ maxValue: null }),
          getCount: jest.fn().mockResolvedValue(0),
          getMany: jest.fn().mockImplementation(async () => resolveData()),
          getManyAndCount: jest.fn().mockImplementation(async () => {
            const data = resolveData();
            return [data, data.length];
          }),
        };
      }),
      count: jest.fn().mockImplementation(async (entity, options) => {
        // La revocación decide OPEN/PENDING_QUOTE contando cotizaciones.
        if (entity?.name === 'SupplierQuote' && options?.where?.purchaseRequestId) {
          return state.quotes.filter(
            (quote) => quote.purchaseRequestId === options.where.purchaseRequestId,
          ).length;
        }
        return 0;
      }),
      delete: jest.fn().mockImplementation(async (entity, criteria) => {
        const awardId = typeof criteria === 'string' ? criteria : criteria?.id;
        if (entity?.name === 'PurchaseRequestLineAward' && awardId) {
          const awardIndex = state.awards.findIndex((award) => award.id === awardId);
          if (awardIndex >= 0) {
            state.awards.splice(awardIndex, 1);
          }
        }
      }),
      remove: jest.fn().mockImplementation(async (_entity, records: Array<{ id: string }>) => {
        for (const record of records) {
          const lineIndex = state.requestLines.findIndex((entry) => entry.id === record.id);
          if (lineIndex >= 0) {
            state.requestLines.splice(lineIndex, 1);
          }
        }
      }),
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

        // Fase 30 BE-2: awards persistidos (creación, no-op con notas y
        // re-adjudicación). Antes del genérico `payload.id`, que busca en
        // requestLines.
        if (payload.purchaseRequestLineId && payload.awardedPartyRefId) {
          if (payload.id) {
            const awardIndex = state.awards.findIndex((award) => award.id === payload.id);
            if (awardIndex >= 0) {
              state.awards[awardIndex] = { ...state.awards[awardIndex], ...payload };
              return state.awards[awardIndex];
            }
          }
          const savedAward = { id: nextAwardId(), ...payload };
          state.awards.push(savedAward);
          return savedAward;
        }

        if (payload.id) {
          const lineIndex = state.requestLines.findIndex((entry) => entry.id === payload.id);
          if (lineIndex >= 0) {
            state.requestLines[lineIndex] = { ...state.requestLines[lineIndex], ...payload };
            return state.requestLines[lineIndex];
          }
        }

        if (payload.orderNumber) {
          if (payload.id) {
            const orderIndex = state.orders.findIndex((entry) => entry.id === payload.id);
            if (orderIndex >= 0) {
              state.orders[orderIndex] = { ...state.orders[orderIndex], ...payload };
              return state.orders[orderIndex];
            }
          }
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
          state.awards.find((award) => award.id === id) ??
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

          return [];
        }

        // Fase 30 BE-2: awards por línea y órdenes vivas por línea (revocación).
        if (options?.where?.purchaseRequestLineId && entity?.name === 'PurchaseRequestLineAward') {
          return state.awards.filter(
            (award) => award.purchaseRequestLineId === options.where.purchaseRequestLineId,
          );
        }
        if (options?.where?.purchaseRequestLineId && entity?.name === 'PurchaseOrderLine') {
          return state.orderLines.filter(
            (line) => line.purchaseRequestLineId === options.where.purchaseRequestLineId,
          );
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
        { provide: RfqPdfService, useValue: { renderAllInvitationsZip: jest.fn() } },
        { provide: PurchaseOrderPdfService, useValue: {} },
        {
          provide: SupplierProfileService,
          useValue: { assertNotBlockedForPurchasing: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: SupplierPartyPort, useValue: supplierPartyPortMock },
        {
          provide: TaxCatalogReadPort,
          useValue: {
            listByContext: jest.fn().mockResolvedValue([
              {
                id: 'def-iva',
                code: 'IVA_19',
                name: 'IVA 19%',
                category: 'VAT',
                baseRate: '19',
                treatment: 'STANDARD',
                context: 'BOTH',
                isActive: true,
              },
              {
                id: 'def-rete-iva',
                code: 'RETE_IVA',
                name: 'Rete IVA',
                category: 'WITHHOLDING',
                baseRate: '15',
                treatment: 'STANDARD',
                context: 'PURCHASE',
                isActive: true,
              },
            ]),
            findActiveByCode: jest.fn(),
            resolveSystemPreset: jest.fn(),
            findById: jest.fn(),
          },
        },
        { provide: GoodsReceiptService, useValue: { receivePurchaseOrder: jest.fn() } },
        { provide: DataSource, useValue: {} },
        JwtAuthGuard,
        RolesGuard,
      ],
    })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

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
    state.awards = [];
    state.orders = [];
    state.orderLines = [];
    state.rfqs = [];
    state.rfqInvitations = [];
    state.nextRequest = 1;
    state.nextRequestLine = 1;
    state.nextQuote = 1;
    state.nextAward = 1;
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
    expect(created.body.status).toBe(PurchaseRequestStatus.DRAFT);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/purchasing/requests/${requestId}`)
      .set('Authorization', 'Bearer support-token')
      .expect(200);

    expect(detail.body.request.id).toBe(requestId);
    expect(detail.body.lines).toHaveLength(1);
    expect(detail.body.purchaseTaxPresets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'IVA_19', name: 'IVA 19%', baseRate: 19 }),
        expect.objectContaining({ code: 'RETE_IVA', name: 'Rete IVA', baseRate: 15 }),
      ]),
    );

    await request(app.getHttpServer())
      .post(`/api/v1/purchasing/requests/${requestId}/approve`)
      .set('Authorization', 'Bearer support-token')
      .send({ exceptionReason: 'Urgencia operativa de prueba no aplica aquí.' })
      .expect(400);

    const quoteResponse = await request(app.getHttpServer())
      .post(`/api/v1/purchasing/requests/${requestId}/quotes`)
      .set('Authorization', 'Bearer support-token')
      .send({
        partyRefId: '55555555-5555-4555-8555-555555555555',
        quoteNumber: 'Q-HTTP-001',
        currency: 'cop',
        lines: [
          {
            purchaseRequestLineId: detail.body.lines[0].id,
            unitCost: 120000,
          },
        ],
      })
      .expect(201);

    expect(quoteResponse.body.payableAmount).toBe('480000.00');
    expect(quoteResponse.body.taxes).toEqual([]);

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

    expect(listed.body.data).toHaveLength(1);
    expect(listed.body.data[0].id).toBe(orderId);

    const providerSummary = await request(app.getHttpServer())
      .get('/api/v1/purchasing/providers/55555555-5555-4555-8555-555555555555/summary')
      .set('Authorization', 'Bearer support-token')
      .expect(200);

    expect(providerSummary.body.displayName).toBe('Proveedor demo');
  });

  it('rechaza tributos duplicados en POST quotes con 400', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/purchasing/requests')
      .set('Authorization', 'Bearer support-token')
      .send({
        title: 'Reposición ONT duplicado fiscal',
        requestType: PurchaseRequestType.REPLENISHMENT,
        priority: PurchaseRequestPriority.HIGH,
        requestingArea: 'Operaciones',
        justification: 'Reposición preventiva para evitar quiebre de stock en cuadrillas.',
        neededByDate: '2026-07-15',
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

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/purchasing/requests/${created.body.id as string}`)
      .set('Authorization', 'Bearer support-token')
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/purchasing/requests/${created.body.id as string}/quotes`)
      .set('Authorization', 'Bearer support-token')
      .send({
        partyRefId: '55555555-5555-4555-8555-555555555555',
        quoteNumber: 'Q-DUP-TAX',
        currency: 'cop',
        lines: [{ purchaseRequestLineId: detail.body.lines[0].id, unitCost: 100 }],
        taxes: [
          { code: 'IVA_19', applies: true, rate: 19 },
          { code: 'IVA_19', applies: true, rate: 5 },
        ],
      })
      .expect(400);
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
    const createdRequest = state.requests.find((entry) => entry.id === requestId);
    if (createdRequest) {
      createdRequest.status = PurchaseRequestStatus.PENDING_QUOTES;
    }
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

  it('edita cabecera y reemplaza líneas de una solicitud en DRAFT', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/purchasing/requests')
      .set('Authorization', 'Bearer support-token')
      .send({
        title: 'Solicitud a editar',
        requestType: PurchaseRequestType.REPLENISHMENT,
        priority: PurchaseRequestPriority.NORMAL,
        requestingArea: 'Operaciones',
        justification: 'Edición de prueba para Fase 07.',
        neededByDate: '2026-09-01',
        lines: [
          {
            sourceKind: PurchaseRequestLineSourceKind.INVENTORY_ITEM,
            inventoryItemId: '44444444-4444-4444-8444-444444444444',
            quantityRequested: 3,
            unitOfMeasure: 'unidad',
          },
        ],
      })
      .expect(201);

    const requestId = created.body.id as string;

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/purchasing/requests/${requestId}`)
      .set('Authorization', 'Bearer support-token')
      .send({
        title: 'Solicitud editada',
        priority: PurchaseRequestPriority.HIGH,
        lines: [
          {
            sourceKind: PurchaseRequestLineSourceKind.FREE_TEXT,
            freeTextDescription: 'Cable de fibra óptica',
            quantityRequested: 100,
            unitOfMeasure: 'metro',
          },
        ],
      })
      .expect(200);

    expect(updated.body.title).toBe('Solicitud editada');
    expect(updated.body.priority).toBe(PurchaseRequestPriority.HIGH);
    const updatedLines = state.requestLines.filter((line) => line.purchaseRequestId === requestId);
    expect(updatedLines).toHaveLength(1);
    expect(updatedLines[0]?.unitOfMeasure).toBe('metro');
  });

  it('bloquea edición cuando la solicitud está en APPROVED', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/purchasing/requests')
      .set('Authorization', 'Bearer support-token')
      .send({
        title: 'Solicitud no editable',
        requestType: PurchaseRequestType.REPLENISHMENT,
        priority: PurchaseRequestPriority.NORMAL,
        requestingArea: 'Operaciones',
        justification: 'Prueba de bloqueo de edición en APPROVED.',
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
      status: PurchaseRequestStatus.APPROVED,
    };

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/purchasing/requests/${requestId}`)
      .set('Authorization', 'Bearer support-token')
      .send({ title: 'No debe actualizar' })
      .expect(400);

    expect(response.body.message).toEqual(
      expect.stringContaining('La solicitud no admite edición en su estado actual.'),
    );
  });

  it('aprueba una orden desde PENDING_APPROVAL', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/purchasing/requests')
      .set('Authorization', 'Bearer support-token')
      .send({
        title: 'Solicitud para OC en aprobación',
        requestType: PurchaseRequestType.REPLENISHMENT,
        priority: PurchaseRequestPriority.NORMAL,
        requestingArea: 'Operaciones',
        justification: 'Prueba de ciclo de vida de OC Fase 07.',
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

    const approveOrderId = '22222222-2222-4222-8222-000000000080';
    state.orders.push({
      id: approveOrderId,
      tenantId: 'tenant-001',
      orderNumber: 'PO-000080',
      purchaseRequestId: created.body.id as string,
      partyRefId: '55555555-5555-4555-8555-555555555555',
      status: PurchaseOrderStatus.PENDING_APPROVAL,
      approvedByUserId: null,
      cancellationReason: null,
      cancelledByUserId: null,
      closedByUserId: null,
    });

    const approved = await request(app.getHttpServer())
      .post(`/api/v1/purchasing/orders/${approveOrderId}/approve`)
      .set('Authorization', 'Bearer support-token')
      .expect(200);

    expect(approved.body.status).toBe(PurchaseOrderStatus.APPROVED);
    expect(approved.body.approvedByUserId).toBe('support-001');
  });

  it('cancela una orden en APPROVED con motivo', async () => {
    // La cancelación revierte el estado derivado de la solicitud origen
    // (ADR-087 D3 extendido), así que la orden debe apuntar a una solicitud
    // que exista realmente en el fixture.
    const created = await request(app.getHttpServer())
      .post('/api/v1/purchasing/requests')
      .set('Authorization', 'Bearer support-token')
      .send({
        title: 'Solicitud para OC a cancelar',
        requestType: PurchaseRequestType.REPLENISHMENT,
        priority: PurchaseRequestPriority.NORMAL,
        requestingArea: 'Operaciones',
        justification: 'Prueba de cancelación de OC Fase 07.',
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

    const cancelOrderId = '22222222-2222-4222-8222-000000000081';
    state.orders.push({
      id: cancelOrderId,
      tenantId: 'tenant-001',
      orderNumber: 'PO-000081',
      purchaseRequestId: created.body.id as string,
      partyRefId: '55555555-5555-4555-8555-555555555555',
      status: PurchaseOrderStatus.APPROVED,
      cancellationReason: null,
      cancelledByUserId: null,
      closedByUserId: null,
      approvedByUserId: 'support-001',
    });

    const cancelled = await request(app.getHttpServer())
      .post(`/api/v1/purchasing/orders/${cancelOrderId}/cancel`)
      .set('Authorization', 'Bearer support-token')
      .send({ reason: 'Proveedor canceló contrato' })
      .expect(200);

    expect(cancelled.body.status).toBe(PurchaseOrderStatus.CANCELLED);
    expect(cancelled.body.cancellationReason).toBe('Proveedor canceló contrato');
    expect(cancelled.body.cancelledByUserId).toBe('support-001');
  });

  it('cierra una orden en FULLY_RECEIVED', async () => {
    const closeOrderId = '22222222-2222-4222-8222-000000000082';
    state.orders.push({
      id: closeOrderId,
      tenantId: 'tenant-001',
      orderNumber: 'PO-000082',
      purchaseRequestId: '11111111-1111-4111-8111-000000000002',
      partyRefId: '55555555-5555-4555-8555-555555555555',
      status: PurchaseOrderStatus.FULLY_RECEIVED,
      cancellationReason: null,
      cancelledByUserId: null,
      closedByUserId: null,
      approvedByUserId: 'support-001',
    });

    const closed = await request(app.getHttpServer())
      .post(`/api/v1/purchasing/orders/${closeOrderId}/close`)
      .set('Authorization', 'Bearer support-token')
      .expect(200);

    expect(closed.body.status).toBe(PurchaseOrderStatus.CLOSED);
    expect(closed.body.closedByUserId).toBe('support-001');
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

  // ===== Fase 30 BE-2 — revocación de adjudicaciones (DELETE awards) =====

  async function createApprovedRequestWithAward() {
    const created = await request(app.getHttpServer())
      .post('/api/v1/purchasing/requests')
      .set('Authorization', 'Bearer support-token')
      .send({
        title: 'Reposición para matriz de adjudicación',
        requestType: PurchaseRequestType.REPLENISHMENT,
        priority: PurchaseRequestPriority.NORMAL,
        requestingArea: 'Operaciones',
        justification: 'Ciclo de adjudicación y revocación de la Fase 30.',
        neededByDate: '2026-10-01',
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
    const requestIndex = state.requests.findIndex((entry) => entry.id === requestId);
    state.requests[requestIndex] = {
      ...state.requests[requestIndex],
      status: PurchaseRequestStatus.APPROVED,
    };

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/purchasing/requests/${requestId}`)
      .set('Authorization', 'Bearer support-token')
      .expect(200);

    const awardsResponse = await request(app.getHttpServer())
      .post(`/api/v1/purchasing/requests/${requestId}/awards`)
      .set('Authorization', 'Bearer support-token')
      .send({
        awards: [
          {
            purchaseRequestLineId: detail.body.lines[0].id,
            awardedPartyRefId: '55555555-5555-4555-8555-555555555555',
            awardedQuantity: '4.00',
          },
        ],
      })
      .expect(201);

    return {
      requestId,
      requestLineId: detail.body.lines[0].id as string,
      awardId: awardsResponse.body.awards[0].id as string,
    };
  }

  it('DELETE awards: revoca sin orden viva, reabre la línea y responde el contrato RevokeAwardResponse', async () => {
    const { requestId, requestLineId, awardId } = await createApprovedRequestWithAward();

    // Autorización: el rol AUDITOR es de solo lectura y el endpoint es MANAGE.
    await request(app.getHttpServer())
      .delete(`/api/v1/purchasing/requests/${requestId}/awards/${awardId}`)
      .set('Authorization', 'Bearer auditor-token')
      .expect(403);

    // Cotización registrada: la línea debe reabrirse en PENDING_QUOTE.
    state.quotes.push({
      id: nextQuoteId(),
      tenantId: 'tenant-001',
      purchaseRequestId: requestId,
      partyRefId: '55555555-5555-4555-8555-555555555555',
      quoteNumber: 'Q-REVOKE',
    });

    const revoked = await request(app.getHttpServer())
      .delete(`/api/v1/purchasing/requests/${requestId}/awards/${awardId}`)
      .set('Authorization', 'Bearer support-token')
      .expect(200);

    expect(revoked.body).toEqual({
      awardId,
      lineStatusAfter: PurchaseRequestLineStatus.PENDING_QUOTE,
      coverage: 'NOT_AWARDED',
    });
    expect(state.awards).toHaveLength(0);
    expect(state.requestLines.find((line) => line.id === requestLineId)?.lineStatus).toBe(
      PurchaseRequestLineStatus.PENDING_QUOTE,
    );
  });

  it('DELETE awards: responde 404 para un award que no existe o no pertenece a la solicitud', async () => {
    const { requestId } = await createApprovedRequestWithAward();

    await request(app.getHttpServer())
      .delete(
        `/api/v1/purchasing/requests/${requestId}/awards/99999999-9999-4999-8999-999999999999`,
      )
      .set('Authorization', 'Bearer support-token')
      .expect(404);
  });

  it('DELETE awards: bloquea la revocación con orden de compra viva (409 AWARD_ALREADY_ORDERED)', async () => {
    const { requestId, requestLineId, awardId } = await createApprovedRequestWithAward();

    state.orders.push({
      id: nextOrderId(),
      tenantId: 'tenant-001',
      orderNumber: 'PO-000090',
      purchaseRequestId: requestId,
      partyRefId: '55555555-5555-4555-8555-555555555555',
      status: PurchaseOrderStatus.APPROVED,
    });
    state.orderLines.push({
      id: nextLineId(),
      tenantId: 'tenant-001',
      purchaseOrderId: state.orders[0]?.id,
      purchaseRequestLineId: requestLineId,
      itemId: '44444444-4444-4444-8444-444444444444',
      quantity: '2.00',
      receivedQuantity: '0.00',
    });

    const revoked = await request(app.getHttpServer())
      .delete(`/api/v1/purchasing/requests/${requestId}/awards/${awardId}`)
      .set('Authorization', 'Bearer support-token')
      .expect(409);

    expect(revoked.body).toMatchObject({ code: 'AWARD_ALREADY_ORDERED' });
    expect(state.awards).toHaveLength(1);
  });
});
