import {
  BadRequestException,
  ForbiddenException,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import {
  InventoryItemCategory,
  InventoryCategoryStatus,
  InventoryTrackingMode,
  PurchaseRequestLineSourceKind,
  PurchaseRequestType,
  SerializedAssetStatus,
  StockAdjustmentReason,
  StockLocationType,
  StockMovementOrigin,
  UserRole,
} from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { InventoryController } from '../inventory.controller';
import { PurchasingController } from '../purchasing.controller';
import { GoodsReceiptService } from '../services/goods-receipt.service';
import { InventoryDashboardService } from '../services/inventory-dashboard.service';
import { InventoryCategoryService } from '../services/inventory-category.service';
import { InventoryItemService } from '../services/inventory-item.service';
import { PurchasingService } from '../services/purchasing.service';
import { PurchasingQueryService } from '../services/purchasing-query.service';
import { SerializedAssetService } from '../services/serialized-asset.service';
import { StockBalanceService } from '../services/stock-balance.service';
import { StockLedgerService } from '../services/stock-ledger.service';
import { StockMovementQueryService } from '../services/stock-movement-query.service';
import { StockLocationService } from '../services/stock-location.service';
import { StockIssueService } from '../services/stock-issue.service';
import { AssetLoanService } from '../services/asset-loan.service';
import { CounterPurchaseService } from '../services/counter-purchase.service';
import { RfqPdfService } from '../services/rfq-pdf.service';
import { ReplenishmentService } from '../services/replenishment.service';
import { CycleCountService } from '../services/cycle-count.service';
import { SupplierProfileService } from '../services/supplier-profile.service';
import { RfqService } from '../services/rfq.service';
import { WriteOffService } from '../services/write-off.service';

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
      const authHeader = req.headers.authorization;

      if (authHeader === 'Bearer support-token') {
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

      if (authHeader === 'Bearer tech-token') {
        req.user = {
          sub: 'tech-001',
          email: 'tech@example.test',
          role: UserRole.TECHNICIAN,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          jti: 'jti-tech',
          type: 'tenant',
        } as JwtPayload;
        return true;
      }

      if (authHeader === 'Bearer admin-token') {
        req.user = {
          sub: 'admin-001',
          email: 'admin@example.test',
          role: UserRole.ADMIN,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          jti: 'jti-admin',
          type: 'tenant',
        } as JwtPayload;
        return true;
      }

      if (authHeader === 'Bearer noc-token') {
        req.user = {
          sub: 'noc-001',
          email: 'noc@example.test',
          role: UserRole.NOC,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          jti: 'jti-noc',
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
      const req = context.switchToHttp().getRequest();
      const user = req.user;
      const requiredRoles: string[] =
        Reflect.getMetadata('roles', context.getHandler() as object) ??
        Reflect.getMetadata('roles', context.getClass() as object) ??
        [];

      if (requiredRoles.length === 0) {
        return true;
      }

      if (!user || !requiredRoles.includes(user.role)) {
        throw new ForbiddenException('No tiene permisos para ejecutar esta accion.');
      }

      return true;
    }
  },
}));

describe('InventoryController HTTP', () => {
  let app: INestApplication;

  const inventoryItemServiceMock = {
    list: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: 'item-001' }),
    getById: jest.fn().mockResolvedValue({ id: 'item-001' }),
    update: jest.fn().mockResolvedValue({ id: 'item-001', purchasable: false }),
    delete: jest.fn().mockResolvedValue(undefined),
    listCatalogOptions: jest.fn().mockResolvedValue([]),
  };
  const inventoryCategoryServiceMock = {
    list: jest.fn().mockResolvedValue([]),
    suggestPrefix: jest.fn().mockResolvedValue({
      code: 'CONSUMIBLESRD',
      codePrefix: 'CRD',
      sortOrder: 2,
    }),
    getById: jest.fn().mockResolvedValue({ id: 'cat-001', productCount: 0 }),
    create: jest.fn().mockResolvedValue({ id: 'cat-001', productCount: 0 }),
    update: jest.fn().mockResolvedValue({ id: 'cat-001', productCount: 2 }),
  };
  const stockLocationServiceMock = {
    list: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: 'loc-001' }),
    update: jest.fn().mockResolvedValue({ id: 'loc-001', status: 'ACTIVE' }),
  };
  const serializedAssetServiceMock = {
    list: jest.fn().mockResolvedValue([]),
    getById: jest.fn().mockResolvedValue({ id: 'asset-001' }),
  };
  const stockBalanceServiceMock = {
    list: jest.fn().mockResolvedValue([]),
  };
  const stockLedgerServiceMock = {
    transfer: jest.fn().mockResolvedValue({ movement: { id: 'mov-001' } }),
    recordExecutionOrderMovement: jest.fn().mockResolvedValue({ movement: { id: 'mov-002' } }),
    recordSale: jest.fn().mockResolvedValue({ movement: { id: 'mov-003' } }),
    recordInternalConsumption: jest.fn().mockResolvedValue({ movement: { id: 'mov-004' } }),
    recordReturn: jest.fn().mockResolvedValue({ movement: { id: 'mov-005' } }),
    recordWriteOff: jest.fn().mockResolvedValue({ movement: { id: 'mov-006' } }),
    recordAdjustment: jest.fn().mockResolvedValue({
      movement: { id: 'mov-adj', movementNumber: 'MOV-000200' },
      lines: [],
    }),
  };
  const stockMovementQueryServiceMock = {
    list: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 }),
    getById: jest.fn().mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      movementNumber: 'MOV-000001',
      lines: [],
    }),
  };
  const inventoryDashboardServiceMock = {
    getSummary: jest.fn().mockResolvedValue({
      itemsCount: 0,
      locationsCount: 0,
      serializedAssetsCount: 0,
      balancesCount: 0,
      totalOnHand: 0,
      estimatedTotalValue: 0,
      balancesByLocation: [],
      balancesByCategory: [],
      serializedAssetsByStatus: [],
      serializedAssetsByResponsibleType: [],
    }),
  };
  const replenishmentServiceMock = {
    listSuggestions: jest.fn().mockResolvedValue([]),
  };
  const cycleCountServiceMock = {
    list: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: 'count-001', lines: [] }),
    getById: jest.fn().mockResolvedValue({ id: 'count-001', lines: [] }),
    update: jest.fn().mockResolvedValue({ id: 'count-001', lines: [] }),
    close: jest.fn().mockResolvedValue({ id: 'count-001', status: 'CLOSED', lines: [] }),
    cancel: jest.fn().mockResolvedValue({ id: 'count-001', status: 'CANCELLED', lines: [] }),
  };
  const purchasingServiceMock = {
    listRequests: jest.fn().mockResolvedValue([]),
    listOrders: jest.fn().mockResolvedValue([]),
    getOrderById: jest.fn().mockResolvedValue({ id: 'po-001', lines: [] }),
    createPurchaseRequest: jest.fn().mockResolvedValue({ id: 'pr-001' }),
    addSupplierQuote: jest.fn().mockResolvedValue({ id: 'quote-001' }),
    approvePurchaseRequest: jest.fn().mockResolvedValue({ id: 'pr-001', status: 'APPROVED' }),
    createPurchaseOrderFromRequest: jest.fn().mockResolvedValue({ id: 'po-001' }),
  };
  const purchasingQueryServiceMock = {
    searchSuppliers: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 }),
    getProviderSummary: jest
      .fn()
      .mockResolvedValue({ partyRefId: 'party-001', displayName: 'Proveedor Demo' }),
  };
  const goodsReceiptServiceMock = {
    receivePurchaseOrder: jest.fn().mockResolvedValue({ id: 'gr-001' }),
  };
  const counterPurchaseServiceMock = {
    record: jest.fn().mockResolvedValue({
      movement: { id: 'mov-counter-001', movementNumber: 'MOV-000099' },
      lines: [],
    }),
  };
  const rfqServiceMock = {
    createFromRequest: jest.fn().mockResolvedValue({ id: 'rfq-001', rfqNumber: 'RFQ-000001' }),
    invite: jest.fn().mockResolvedValue([]),
    send: jest.fn().mockResolvedValue({ id: 'rfq-001', status: 'SENT' }),
    decline: jest.fn().mockResolvedValue({ id: 'inv-001', status: 'DECLINED' }),
    close: jest.fn().mockResolvedValue({ id: 'rfq-001', status: 'CLOSED' }),
    getById: jest
      .fn()
      .mockResolvedValue({ rfq: { id: 'rfq-001' }, invitations: [], request: {}, lines: [] }),
  };
  const rfqPdfServiceMock = {
    renderForInvitation: jest.fn().mockResolvedValue({
      buffer: Buffer.from('%PDF-1.4\n'),
      filename: 'RFQ-000001-proveedor.pdf',
    }),
    renderAllInvitationsZip: jest.fn().mockResolvedValue({
      buffer: Buffer.from('PK'),
      filename: 'RFQ-000001-cotizaciones.zip',
    }),
  };
  const stockIssueServiceMock = {
    list: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: 'issue-001' }),
    getById: jest.fn().mockResolvedValue({ id: 'issue-001', lines: [] }),
    update: jest.fn().mockResolvedValue({ id: 'issue-001', status: 'DRAFT' }),
    cancel: jest.fn().mockResolvedValue({ id: 'issue-001', status: 'CANCELLED' }),
    dispatch: jest.fn().mockResolvedValue({ id: 'issue-001', status: 'DISPATCHED' }),
  };
  const writeOffServiceMock = {
    createRequest: jest.fn().mockResolvedValue({
      id: 'wo-001',
      status: 'PENDING_APPROVAL',
    }),
    list: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 }),
    getById: jest.fn().mockResolvedValue({ id: 'wo-001', status: 'PENDING_APPROVAL' }),
    approve: jest.fn().mockResolvedValue({
      writeOff: { id: 'wo-001', status: 'COMPLETED', stockMovementId: 'mov-006' },
      movementResult: { movement: { id: 'mov-006' }, lines: [] },
    }),
    reject: jest.fn().mockResolvedValue({ id: 'wo-001', status: 'REJECTED' }),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [InventoryController, PurchasingController],
      providers: [
        { provide: InventoryItemService, useValue: inventoryItemServiceMock },
        { provide: InventoryCategoryService, useValue: inventoryCategoryServiceMock },
        { provide: StockLocationService, useValue: stockLocationServiceMock },
        { provide: SerializedAssetService, useValue: serializedAssetServiceMock },
        { provide: StockBalanceService, useValue: stockBalanceServiceMock },
        { provide: StockLedgerService, useValue: stockLedgerServiceMock },
        { provide: StockMovementQueryService, useValue: stockMovementQueryServiceMock },
        { provide: StockIssueService, useValue: stockIssueServiceMock },
        { provide: InventoryDashboardService, useValue: inventoryDashboardServiceMock },
        { provide: ReplenishmentService, useValue: replenishmentServiceMock },
        { provide: CycleCountService, useValue: cycleCountServiceMock },
        { provide: WriteOffService, useValue: writeOffServiceMock },
        { provide: AssetLoanService, useValue: { list: jest.fn() } },
        { provide: PurchasingService, useValue: purchasingServiceMock },
        { provide: PurchasingQueryService, useValue: purchasingQueryServiceMock },
        { provide: GoodsReceiptService, useValue: goodsReceiptServiceMock },
        { provide: CounterPurchaseService, useValue: counterPurchaseServiceMock },
        { provide: RfqService, useValue: rfqServiceMock },
        { provide: RfqPdfService, useValue: rfqPdfServiceMock },
        { provide: SupplierProfileService, useValue: {} },
        JwtAuthGuard,
        RolesGuard,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when listing items without token', async () => {
    await request(app.getHttpServer()).get('/api/v1/inventory/items').expect(401);
  });

  it('creates inventory item for support role', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/inventory/items')
      .set('Authorization', 'Bearer support-token')
      .send({
        sku: 'ONU-HG8145',
        name: 'ONU Huawei',
        categoryId: '11111111-1111-4111-8111-111111111111',
        trackingMode: InventoryTrackingMode.SERIALIZED,
        unitOfMeasure: 'unidad',
      })
      .expect(201);

    expect(inventoryItemServiceMock.create).toHaveBeenCalled();
  });

  it('creates inventory category for support role', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/inventory/categories')
      .set('Authorization', 'Bearer support-token')
      .send({
        code: 'FIBER',
        codePrefix: 'FIB',
        name: 'Fibra optica',
        status: InventoryCategoryStatus.ACTIVE,
      })
      .expect(201);

    expect(inventoryCategoryServiceMock.create).toHaveBeenCalled();
  });

  it('lists inventory categories for support role', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/inventory/categories?search=fibra')
      .set('Authorization', 'Bearer support-token')
      .expect(200);

    expect(inventoryCategoryServiceMock.list).toHaveBeenCalledWith({ search: 'fibra' });
  });

  it('suggests inventory category prefix for support role', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/inventory/categories/suggest-prefix?name=Consumibles%20RD')
      .set('Authorization', 'Bearer support-token')
      .expect(200);

    expect(inventoryCategoryServiceMock.suggestPrefix).toHaveBeenCalledWith({
      name: 'Consumibles RD',
    });
  });

  it('lists catalog options for support role', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/inventory/items/catalog/options?search=ont')
      .set('Authorization', 'Bearer support-token')
      .expect(200);

    expect(inventoryItemServiceMock.listCatalogOptions).toHaveBeenCalledWith(
      { search: 'ont' },
      expect.objectContaining({ sub: 'support-001' }),
    );
  });

  it('returns item detail for support role', async () => {
    const itemId = '11111111-1111-4111-8111-111111111111';

    await request(app.getHttpServer())
      .get(`/api/v1/inventory/items/${itemId}`)
      .set('Authorization', 'Bearer support-token')
      .expect(200);

    expect(inventoryItemServiceMock.getById).toHaveBeenCalledWith(itemId);
  });

  it('updates inventory item for support role', async () => {
    const itemId = '11111111-1111-4111-8111-111111111111';

    await request(app.getHttpServer())
      .patch(`/api/v1/inventory/items/${itemId}`)
      .set('Authorization', 'Bearer support-token')
      .send({ purchasable: false })
      .expect(200);

    expect(inventoryItemServiceMock.update).toHaveBeenCalledWith(
      itemId,
      { purchasable: false },
      expect.objectContaining({ sub: 'support-001' }),
    );
  });

  it('deletes inventory item for support role', async () => {
    const itemId = '11111111-1111-4111-8111-111111111111';

    await request(app.getHttpServer())
      .delete(`/api/v1/inventory/items/${itemId}`)
      .set('Authorization', 'Bearer support-token')
      .expect(204);

    expect(inventoryItemServiceMock.delete).toHaveBeenCalledWith(
      itemId,
      expect.objectContaining({ sub: 'support-001' }),
    );
  });

  it('filters inventory items by purchasable query param', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/inventory/items?purchasable=true&search=ont')
      .set('Authorization', 'Bearer support-token')
      .expect(200);

    expect(inventoryItemServiceMock.list).toHaveBeenCalledWith({
      purchasable: true,
      search: 'ont',
    });
  });

  it('returns 403 when technician tries to create items', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/inventory/items')
      .set('Authorization', 'Bearer tech-token')
      .send({
        sku: 'ONU-HG8145',
        name: 'ONU Huawei',
        category: InventoryItemCategory.CPE,
        trackingMode: InventoryTrackingMode.SERIALIZED,
        unitOfMeasure: 'unidad',
      })
      .expect(403);
  });

  it('returns 400 for invalid transfer payload', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/inventory/transfers')
      .set('Authorization', 'Bearer support-token')
      .send({
        itemId: 'item-001',
        sourceLocationId: 'loc-001',
        destinationLocationId: 'loc-002',
        quantity: 0,
      })
      .expect(400);
  });

  it('creates purchase requests for support role', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/purchasing/requests')
      .set('Authorization', 'Bearer support-token')
      .send({
        title: 'Compra de cable drop',
        requestType: PurchaseRequestType.REPLENISHMENT,
        requestingArea: 'Operaciones',
        justification: 'Reposición programada de cable para cuadrillas de campo',
        lines: [
          {
            sourceKind: PurchaseRequestLineSourceKind.INVENTORY_ITEM,
            inventoryItemId: '11111111-1111-4111-8111-111111111111',
            quantityRequested: 10,
            unitOfMeasure: 'metro',
          },
        ],
      })
      .expect(201);

    expect(purchasingServiceMock.createPurchaseRequest).toHaveBeenCalled();
  });

  it('returns purchase order detail with lines for support role', async () => {
    const orderId = '11111111-1111-4111-8111-111111111111';
    purchasingServiceMock.getOrderById.mockResolvedValue({
      id: orderId,
      orderNumber: 'PO-000001',
      lines: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          itemId: '33333333-3333-4333-8333-333333333333',
          quantity: '10.00',
          receivedQuantity: '0.00',
        },
      ],
    });

    const response = await request(app.getHttpServer())
      .get(`/api/v1/purchasing/orders/${orderId}`)
      .set('Authorization', 'Bearer support-token')
      .expect(200);

    expect(response.body.lines).toHaveLength(1);
    expect(purchasingServiceMock.getOrderById).toHaveBeenCalledWith(orderId);
  });

  it('returns 400 when creating stock location with invalid type', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/inventory/locations')
      .set('Authorization', 'Bearer support-token')
      .send({
        code: 'BOD-01',
        name: 'Bodega principal',
        type: 'INVALID_TYPE',
      })
      .expect(400);
  });

  it('creates stock location with valid payload', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/inventory/locations')
      .set('Authorization', 'Bearer support-token')
      .send({
        code: 'BOD-01',
        name: 'Bodega principal',
        type: StockLocationType.MAIN_WAREHOUSE,
      })
      .expect(201);
  });

  it('updates stock location name and capacity', async () => {
    const locationId = '11111111-1111-4111-8111-111111111111';
    const responsibleRefId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    await request(app.getHttpServer())
      .patch(`/api/v1/inventory/locations/${locationId}`)
      .set('Authorization', 'Bearer support-token')
      .send({
        name: 'Bodega principal ajustada',
        responsibleRefId,
        maxCapacity: 25,
      })
      .expect(200);

    expect(stockLocationServiceMock.update).toHaveBeenCalledWith(locationId, {
      name: 'Bodega principal ajustada',
      responsibleRefId,
      maxCapacity: 25,
    });
  });

  it('returns 400 when stock location responsibleRefId is not a uuid', async () => {
    const locationId = '11111111-1111-4111-8111-111111111111';

    await request(app.getHttpServer())
      .patch(`/api/v1/inventory/locations/${locationId}`)
      .set('Authorization', 'Bearer support-token')
      .send({
        responsibleRefId: 'tech-001',
      })
      .expect(400);
  });

  it('archives stock location', async () => {
    const locationId = '11111111-1111-4111-8111-111111111111';

    await request(app.getHttpServer())
      .patch(`/api/v1/inventory/locations/${locationId}`)
      .set('Authorization', 'Bearer support-token')
      .send({
        status: 'ARCHIVED',
      })
      .expect(200);

    expect(stockLocationServiceMock.update).toHaveBeenCalledWith(locationId, {
      status: 'ARCHIVED',
    });
  });

  it('returns 400 when a return tries to set a terminal status directly', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/inventory/returns')
      .set('Authorization', 'Bearer support-token')
      .send({
        itemId: '11111111-1111-4111-8111-111111111111',
        sourceLocationId: '22222222-2222-4222-8222-222222222222',
        destinationLocationId: '33333333-3333-4333-8333-333333333333',
        quantity: 1,
        targetStatus: SerializedAssetStatus.AVAILABLE,
      })
      .expect(400);
  });

  it('creates stock issue for support role', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/inventory/issues')
      .set('Authorization', 'Bearer support-token')
      .send({
        type: 'TECHNICIAN_CUSTODY',
        sourceLocationId: '11111111-1111-4111-8111-111111111111',
        destinationLocationId: '22222222-2222-4222-8222-222222222222',
        lines: [
          {
            itemId: '33333333-3333-4333-8333-333333333333',
            requestedQty: 1,
          },
        ],
      })
      .expect(201);

    expect(stockIssueServiceMock.create).toHaveBeenCalled();
  });

  it('returns 400 for invalid stock issue payload', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/inventory/issues')
      .set('Authorization', 'Bearer support-token')
      .send({
        type: 'TECHNICIAN_CUSTODY',
        sourceLocationId: '11111111-1111-4111-8111-111111111111',
        lines: [],
      })
      .expect(400);
  });

  it('returns 400 when stock issue uses the same source and destination', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/inventory/issues')
      .set('Authorization', 'Bearer support-token')
      .send({
        type: 'WAREHOUSE_TO_WAREHOUSE',
        sourceLocationId: '11111111-1111-4111-8111-111111111111',
        destinationLocationId: '11111111-1111-4111-8111-111111111111',
        lines: [
          {
            itemId: '33333333-3333-4333-8333-333333333333',
            requestedQty: 1,
          },
        ],
      })
      .expect(400);
  });

  it('returns 400 when stock issue targets another MAIN_WAREHOUSE location', async () => {
    stockIssueServiceMock.create.mockRejectedValueOnce(
      new BadRequestException('La transferencia entre bodegas requiere un destino permitido.'),
    );

    await request(app.getHttpServer())
      .post('/api/v1/inventory/issues')
      .set('Authorization', 'Bearer support-token')
      .send({
        type: 'WAREHOUSE_TO_WAREHOUSE',
        sourceLocationId: '11111111-1111-4111-8111-111111111111',
        destinationLocationId: '22222222-2222-4222-8222-222222222222',
        lines: [
          {
            itemId: '33333333-3333-4333-8333-333333333333',
            requestedQty: 1,
          },
        ],
      })
      .expect(400);
  });

  it('lists stock issues for support role', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/inventory/issues?status=DRAFT&type=CREW_CUSTODY')
      .set('Authorization', 'Bearer support-token')
      .expect(200);

    expect(stockIssueServiceMock.list).toHaveBeenCalledWith({
      status: 'DRAFT',
      type: 'CREW_CUSTODY',
    });
  });

  it('gets stock issue detail for support role', async () => {
    const issueId = '11111111-1111-4111-8111-111111111111';
    await request(app.getHttpServer())
      .get(`/api/v1/inventory/issues/${issueId}`)
      .set('Authorization', 'Bearer support-token')
      .expect(200);

    expect(stockIssueServiceMock.getById).toHaveBeenCalledWith(issueId);
  });

  it('cancels stock issue for support role', async () => {
    const issueId = '11111111-1111-4111-8111-111111111111';
    await request(app.getHttpServer())
      .post(`/api/v1/inventory/issues/${issueId}/cancel`)
      .set('Authorization', 'Bearer support-token')
      .send({})
      .expect(201);

    expect(stockIssueServiceMock.cancel).toHaveBeenCalledWith(
      issueId,
      expect.objectContaining({ sub: 'support-001' }),
    );
  });

  it('dispatches stock issue for support role', async () => {
    const issueId = '11111111-1111-4111-8111-111111111111';
    await request(app.getHttpServer())
      .post(`/api/v1/inventory/issues/${issueId}/dispatch`)
      .set('Authorization', 'Bearer support-token')
      .send({ handoffMethod: 'ACTA', handoffNotes: 'Entrega a técnico' })
      .expect(201);

    expect(stockIssueServiceMock.dispatch).toHaveBeenCalledWith(
      issueId,
      expect.objectContaining({ handoffMethod: 'ACTA' }),
      expect.objectContaining({ sub: 'support-001' }),
    );
  });

  describe('kardex and adjustments', () => {
    it('lists stock movements with parsed query for support', async () => {
      await request(app.getHttpServer())
        .get(
          '/api/v1/inventory/movements?origin=ADJUSTMENT&search=MOV&page=2&limit=10&itemId=11111111-1111-4111-8111-111111111111',
        )
        .set('Authorization', 'Bearer support-token')
        .expect(200);

      expect(stockMovementQueryServiceMock.list).toHaveBeenCalledWith(
        expect.objectContaining({
          origin: StockMovementOrigin.ADJUSTMENT,
          search: 'MOV',
          page: 2,
          limit: 10,
          itemId: '11111111-1111-4111-8111-111111111111',
        }),
      );
    });

    it('rejects invalid movement id', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/inventory/movements/not-a-uuid')
        .set('Authorization', 'Bearer support-token')
        .expect(400);
    });

    it('gets movement detail for support', async () => {
      const movementId = '11111111-1111-4111-8111-111111111111';
      await request(app.getHttpServer())
        .get(`/api/v1/inventory/movements/${movementId}`)
        .set('Authorization', 'Bearer support-token')
        .expect(200);

      expect(stockMovementQueryServiceMock.getById).toHaveBeenCalledWith(movementId);
    });

    it('allows admin to create adjustment', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/inventory/adjustments')
        .set('Authorization', 'Bearer admin-token')
        .send({
          itemId: '11111111-1111-4111-8111-111111111111',
          locationId: '22222222-2222-4222-8222-222222222222',
          quantityDelta: -1,
          reason: StockAdjustmentReason.DAMAGE,
          idempotencyKey: 'idempotency-key-01',
        })
        .expect(201);

      expect(stockLedgerServiceMock.recordAdjustment).toHaveBeenCalledWith(
        expect.objectContaining({
          quantityDelta: -1,
          reason: StockAdjustmentReason.DAMAGE,
          idempotencyKey: 'idempotency-key-01',
        }),
        expect.objectContaining({ sub: 'admin-001' }),
      );
    });

    it('forbids support from creating adjustments', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/inventory/adjustments')
        .set('Authorization', 'Bearer support-token')
        .send({
          itemId: '11111111-1111-4111-8111-111111111111',
          locationId: '22222222-2222-4222-8222-222222222222',
          quantityDelta: 1,
          reason: StockAdjustmentReason.FOUND,
          idempotencyKey: 'idempotency-key-02',
        })
        .expect(403);
    });

    it('forbids noc from creating adjustments', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/inventory/adjustments')
        .set('Authorization', 'Bearer noc-token')
        .send({
          itemId: '11111111-1111-4111-8111-111111111111',
          locationId: '22222222-2222-4222-8222-222222222222',
          quantityDelta: 1,
          reason: StockAdjustmentReason.FOUND,
          idempotencyKey: 'idempotency-key-03',
        })
        .expect(403);
    });

    it('rejects invalid adjustment body', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/inventory/adjustments')
        .set('Authorization', 'Bearer admin-token')
        .send({
          itemId: '11111111-1111-4111-8111-111111111111',
          locationId: '22222222-2222-4222-8222-222222222222',
          quantityDelta: 0,
          reason: StockAdjustmentReason.OTHER,
          idempotencyKey: 'short',
        })
        .expect(400);
    });
  });

  describe('replenishment suggestions', () => {
    it('returns 401 without token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/inventory/replenishment/suggestions')
        .expect(401);
    });

    it('allows admin to list suggestions', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/inventory/replenishment/suggestions')
        .set('Authorization', 'Bearer admin-token')
        .expect(200);

      expect(replenishmentServiceMock.listSuggestions).toHaveBeenCalled();
    });

    it('allows noc to list suggestions', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/inventory/replenishment/suggestions')
        .set('Authorization', 'Bearer noc-token')
        .expect(200);
    });

    it('allows support to list suggestions', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/inventory/replenishment/suggestions')
        .set('Authorization', 'Bearer support-token')
        .expect(200);
    });

    it('forbids technician from listing suggestions', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/inventory/replenishment/suggestions')
        .set('Authorization', 'Bearer tech-token')
        .expect(403);
    });
  });

  describe('cycle counts', () => {
    const countId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    it('allows support to create and list counts', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/inventory/counts')
        .set('Authorization', 'Bearer support-token')
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/v1/inventory/counts')
        .set('Authorization', 'Bearer support-token')
        .send({ locationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' })
        .expect(201);

      expect(cycleCountServiceMock.create).toHaveBeenCalled();
    });

    it('forbids noc and support from closing counts', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/inventory/counts/${countId}/close`)
        .set('Authorization', 'Bearer noc-token')
        .send({})
        .expect(403);

      await request(app.getHttpServer())
        .post(`/api/v1/inventory/counts/${countId}/close`)
        .set('Authorization', 'Bearer support-token')
        .send({})
        .expect(403);
    });

    it('allows admin to close counts', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/inventory/counts/${countId}/close`)
        .set('Authorization', 'Bearer admin-token')
        .send({})
        .expect(201);

      expect(cycleCountServiceMock.close).toHaveBeenCalledWith(countId, expect.any(Object));
    });
  });

  describe('write-offs', () => {
    const locationId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const itemId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

    it('crea solicitud pendiente sin invocar ledger directo', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/inventory/write-offs')
        .set('Authorization', 'Bearer support-token')
        .send({
          itemId,
          locationId,
          quantity: 2,
          reason: 'DAMAGED',
        })
        .expect(201);

      expect(writeOffServiceMock.createRequest).toHaveBeenCalled();
      expect(stockLedgerServiceMock.recordWriteOff).not.toHaveBeenCalled();
    });

    it('permite listar y aprobar solicitudes de baja', async () => {
      const writeOffId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

      await request(app.getHttpServer())
        .get('/api/v1/inventory/write-offs')
        .set('Authorization', 'Bearer support-token')
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/v1/inventory/write-offs/${writeOffId}`)
        .set('Authorization', 'Bearer support-token')
        .expect(200);

      await request(app.getHttpServer())
        .post(`/api/v1/inventory/write-offs/${writeOffId}/approve`)
        .set('Authorization', 'Bearer admin-token')
        .send({})
        .expect(201);

      expect(writeOffServiceMock.list).toHaveBeenCalled();
      expect(writeOffServiceMock.getById).toHaveBeenCalledWith(writeOffId);
      expect(writeOffServiceMock.approve).toHaveBeenCalledWith(writeOffId, expect.any(Object));
    });
  });
});
