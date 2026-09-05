import { ForbiddenException, INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { UserRole } from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { InventoryController } from '../inventory.controller';
import { InventoryItemService } from '../services/inventory-item.service';
import { InventoryCategoryService } from '../services/inventory-category.service';
import { StockLocationService } from '../services/stock-location.service';
import { SerializedAssetService } from '../services/serialized-asset.service';
import { StockBalanceService } from '../services/stock-balance.service';
import { StockIssuePickingService } from '../services/stock-issue-picking.service';
import { ExecutorCustodyService } from '../services/executor-custody.service';
import { StockLedgerService } from '../services/stock-ledger.service';
import { StockMovementQueryService } from '../services/stock-movement-query.service';
import { StockIssueService } from '../services/stock-issue.service';
import { CounterPurchaseService } from '../services/counter-purchase.service';
import { InventoryDashboardService } from '../services/inventory-dashboard.service';
import { ReplenishmentService } from '../services/replenishment.service';
import { CycleCountService } from '../services/cycle-count.service';
import { AssetLoanService } from '../services/asset-loan.service';
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
      const tokens: Record<string, JwtPayload> = {
        'Bearer support-token': {
          sub: 'support-001',
          email: 'support@example.test',
          role: UserRole.SUPPORT,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          jti: 'jti-support',
          type: 'tenant',
        } as JwtPayload,
        'Bearer tech-token': {
          sub: 'tech-001',
          email: 'tech@example.test',
          role: UserRole.TECHNICIAN,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          jti: 'jti-tech',
          type: 'tenant',
        } as JwtPayload,
        'Bearer sales-token': {
          sub: 'sales-001',
          email: 'sales@example.test',
          role: UserRole.SALES,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          jti: 'jti-sales',
          type: 'tenant',
        } as JwtPayload,
      };
      const authHeader = req.headers.authorization;
      const user = authHeader ? tokens[authHeader] : undefined;
      if (!user) {
        throw new UnauthorizedException('Token de acceso invalido o expirado.');
      }
      req.user = user;
      return true;
    }
  },
}));

jest.mock('../../access-control/guards/permissions.guard', () => ({
  PermissionsGuard: class PermissionsGuard {
    canActivate() {
      return true;
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

const SOURCE_ID = '11111111-1111-4111-8111-111111111111';

function buildPageMeta(limit = 25) {
  return {
    nextCursor: null,
    total: 1,
    totalIsEstimate: false,
    page: 1,
    limit,
    totalPages: 1,
    hasMore: false,
    mode: 'page',
    capabilities: { randomAccess: true, sortableFields: [] },
    sort: null,
  };
}

describe('InventoryController GET /inventory/issues/pickable-items (HTTP · B1)', () => {
  let app: INestApplication;

  const stockIssuePickingServiceMock = {
    listPickableItems: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [InventoryController],
      providers: [
        { provide: InventoryItemService, useValue: {} },
        { provide: InventoryCategoryService, useValue: {} },
        { provide: StockLocationService, useValue: {} },
        { provide: SerializedAssetService, useValue: {} },
        { provide: StockBalanceService, useValue: {} },
        { provide: StockIssuePickingService, useValue: stockIssuePickingServiceMock },
        { provide: ExecutorCustodyService, useValue: {} },
        { provide: StockLedgerService, useValue: {} },
        { provide: StockMovementQueryService, useValue: {} },
        { provide: StockIssueService, useValue: {} },
        { provide: CounterPurchaseService, useValue: {} },
        { provide: InventoryDashboardService, useValue: {} },
        { provide: ReplenishmentService, useValue: {} },
        { provide: CycleCountService, useValue: {} },
        { provide: AssetLoanService, useValue: {} },
        { provide: WriteOffService, useValue: {} },
        JwtAuthGuard,
        RolesGuard,
        PermissionsGuard,
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
    stockIssuePickingServiceMock.listPickableItems.mockResolvedValue({
      data: [],
      meta: buildPageMeta(),
    });
  });

  it('resuelve pickable-items antes que issues/:id y aplica defaults (scope with-stock, limit 25)', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/inventory/issues/pickable-items?sourceLocationId=${SOURCE_ID}`)
      .set('Authorization', 'Bearer support-token')
      .expect(200);

    expect(response.body.meta.mode).toBe('page');
    expect(stockIssuePickingServiceMock.listPickableItems).toHaveBeenCalledWith({
      sourceLocationId: SOURCE_ID,
      scope: 'with-stock',
      limit: 25,
    });
  });

  it('propaga q, scope=catalog y page al servicio', async () => {
    await request(app.getHttpServer())
      .get(
        `/api/v1/inventory/issues/pickable-items?sourceLocationId=${SOURCE_ID}&q=onu&scope=catalog&page=2&limit=10`,
      )
      .set('Authorization', 'Bearer tech-token')
      .expect(200);

    expect(stockIssuePickingServiceMock.listPickableItems).toHaveBeenCalledWith({
      sourceLocationId: SOURCE_ID,
      q: 'onu',
      scope: 'catalog',
      page: 2,
      limit: 10,
    });
  });

  it('rechaza 400 sin sourceLocationId', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/inventory/issues/pickable-items')
      .set('Authorization', 'Bearer support-token')
      .expect(400);

    expect(response.body).toEqual(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    expect(stockIssuePickingServiceMock.listPickableItems).not.toHaveBeenCalled();
  });

  it('rechaza 400 cuando sourceLocationId no es UUID', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/inventory/issues/pickable-items?sourceLocationId=no-es-uuid')
      .set('Authorization', 'Bearer support-token')
      .expect(400);

    expect(stockIssuePickingServiceMock.listPickableItems).not.toHaveBeenCalled();
  });

  it('rechaza 400 cuando limit excede 100', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/inventory/issues/pickable-items?sourceLocationId=${SOURCE_ID}&limit=101`)
      .set('Authorization', 'Bearer support-token')
      .expect(400);

    expect(stockIssuePickingServiceMock.listPickableItems).not.toHaveBeenCalled();
  });

  it('rechaza 400 con scope inválido', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/inventory/issues/pickable-items?sourceLocationId=${SOURCE_ID}&scope=bodega`)
      .set('Authorization', 'Bearer support-token')
      .expect(400);

    expect(stockIssuePickingServiceMock.listPickableItems).not.toHaveBeenCalled();
  });

  it('rechaza 403 a un rol sin lectura de inventario (SALES)', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/inventory/issues/pickable-items?sourceLocationId=${SOURCE_ID}`)
      .set('Authorization', 'Bearer sales-token')
      .expect(403);

    expect(stockIssuePickingServiceMock.listPickableItems).not.toHaveBeenCalled();
  });

  it('rechaza 401 sin token', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/inventory/issues/pickable-items?sourceLocationId=${SOURCE_ID}`)
      .expect(401);

    expect(stockIssuePickingServiceMock.listPickableItems).not.toHaveBeenCalled();
  });
});
