import { ForbiddenException, INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import {
  InventoryItemCategory,
  InventoryCategoryStatus,
  InventoryTrackingMode,
  PurchaseRequestLineSourceKind,
  PurchaseRequestType,
  StockLocationType,
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
import { StockLocationService } from '../services/stock-location.service';

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
    listCatalogOptions: jest.fn().mockResolvedValue([]),
  };
  const inventoryCategoryServiceMock = {
    list: jest.fn().mockResolvedValue([]),
    getById: jest.fn().mockResolvedValue({ id: 'cat-001', productCount: 0 }),
    create: jest.fn().mockResolvedValue({ id: 'cat-001', productCount: 0 }),
    update: jest.fn().mockResolvedValue({ id: 'cat-001', productCount: 2 }),
  };
  const stockLocationServiceMock = {
    list: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: 'loc-001' }),
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
  };
  const inventoryDashboardServiceMock = {
    getSummary: jest.fn().mockResolvedValue({ itemsCount: 0 }),
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
        { provide: InventoryDashboardService, useValue: inventoryDashboardServiceMock },
        { provide: PurchasingService, useValue: purchasingServiceMock },
        { provide: PurchasingQueryService, useValue: purchasingQueryServiceMock },
        { provide: GoodsReceiptService, useValue: goodsReceiptServiceMock },
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
});
