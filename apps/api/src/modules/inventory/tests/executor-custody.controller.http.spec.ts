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
import { ExecutorCustodyService } from '../services/executor-custody.service';
import { InventoryItemService } from '../services/inventory-item.service';
import { InventoryCategoryService } from '../services/inventory-category.service';
import { StockLocationService } from '../services/stock-location.service';
import { SerializedAssetService } from '../services/serialized-asset.service';
import { StockBalanceService } from '../services/stock-balance.service';
import { StockLedgerService } from '../services/stock-ledger.service';
import { StockMovementQueryService } from '../services/stock-movement-query.service';
import { StockIssueService } from '../services/stock-issue.service';
import { StockIssuePickingService } from '../services/stock-issue-picking.service';
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
        'Bearer tech-token': {
          sub: 'tech-001',
          email: 'tech@example.test',
          role: UserRole.TECHNICIAN,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          jti: 'jti-tech',
          type: 'tenant',
        } as JwtPayload,
        'Bearer support-token': {
          sub: 'support-001',
          email: 'support@example.test',
          role: UserRole.SUPPORT,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          jti: 'jti-support',
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

const RESPONSIBLE_ID = '44444444-4444-4444-8444-000000000001';
const LOCATION_ID = '33333333-3333-4333-8333-000000000001';

function buildEmptyMeta(limit = 25) {
  return {
    nextCursor: null,
    total: 0,
    totalIsEstimate: false,
    page: 1,
    limit,
    totalPages: 0,
    hasMore: false,
    mode: 'page',
    capabilities: { randomAccess: true, sortableFields: [] },
    sort: null,
  };
}

describe('InventoryController GET /inventory/custody (HTTP)', () => {
  let app: INestApplication;

  const executorCustodyServiceMock = {
    getCustody: jest.fn(),
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
        { provide: ExecutorCustodyService, useValue: executorCustodyServiceMock },
        { provide: StockLedgerService, useValue: {} },
        { provide: StockMovementQueryService, useValue: {} },
        { provide: StockIssueService, useValue: {} },
        { provide: StockIssuePickingService, useValue: {} },
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
    executorCustodyServiceMock.getCustody.mockResolvedValue({
      location: {
        id: LOCATION_ID,
        name: 'Móvil técnico zona norte',
        type: 'MOBILE_TECHNICIAN',
        responsibleType: 'TECHNICIAN',
        responsibleRefId: RESPONSIBLE_ID,
      },
      assets: { items: [], meta: buildEmptyMeta() },
      balances: { items: [], meta: buildEmptyMeta() },
    });
  });

  it('devuelve 200 con la custodia activa del responsable', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/inventory/custody?responsibleRefId=${RESPONSIBLE_ID}`)
      .set('Authorization', 'Bearer tech-token')
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        location: expect.objectContaining({
          id: LOCATION_ID,
          type: 'MOBILE_TECHNICIAN',
          responsibleType: 'TECHNICIAN',
          responsibleRefId: RESPONSIBLE_ID,
        }),
        assets: expect.objectContaining({ items: expect.any(Array), meta: expect.any(Object) }),
        balances: expect.objectContaining({ items: expect.any(Array), meta: expect.any(Object) }),
      }),
    );
    expect(executorCustodyServiceMock.getCustody).toHaveBeenCalledWith({
      responsibleRefId: RESPONSIBLE_ID,
      page: 1,
      limit: 25,
    });
  });

  it('devuelve 200 con location null y colecciones vacías sin custodia activa', async () => {
    executorCustodyServiceMock.getCustody.mockResolvedValue({
      location: null,
      assets: { items: [], meta: buildEmptyMeta() },
      balances: { items: [], meta: buildEmptyMeta() },
    });

    const response = await request(app.getHttpServer())
      .get(`/api/v1/inventory/custody?responsibleRefId=${RESPONSIBLE_ID}`)
      .set('Authorization', 'Bearer support-token')
      .expect(200);

    expect(response.body.location).toBeNull();
    expect(response.body.assets.items).toHaveLength(0);
    expect(response.body.balances.items).toHaveLength(0);
    expect(response.body.assets.meta.total).toBe(0);
    expect(response.body.balances.meta.total).toBe(0);
  });

  it('aplica la paginación compartida cuando se envía page y limit', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/inventory/custody?responsibleRefId=${RESPONSIBLE_ID}&page=2&limit=10`)
      .set('Authorization', 'Bearer tech-token')
      .expect(200);

    expect(executorCustodyServiceMock.getCustody).toHaveBeenCalledWith({
      responsibleRefId: RESPONSIBLE_ID,
      page: 2,
      limit: 10,
    });
  });

  it('rechaza 400 sin responsibleRefId', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/inventory/custody')
      .set('Authorization', 'Bearer tech-token')
      .expect(400);

    expect(response.body).toEqual(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    expect(executorCustodyServiceMock.getCustody).not.toHaveBeenCalled();
  });

  it('rechaza 400 cuando responsibleRefId no es UUID', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/inventory/custody?responsibleRefId=no-es-uuid')
      .set('Authorization', 'Bearer tech-token')
      .expect(400);

    expect(executorCustodyServiceMock.getCustody).not.toHaveBeenCalled();
  });

  it('rechaza 400 cuando limit excede el máximo de 100', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/inventory/custody?responsibleRefId=${RESPONSIBLE_ID}&limit=101`)
      .set('Authorization', 'Bearer tech-token')
      .expect(400);

    expect(executorCustodyServiceMock.getCustody).not.toHaveBeenCalled();
  });

  it('permite a TECHNICIAN consultar su custodia', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/inventory/custody?responsibleRefId=${RESPONSIBLE_ID}`)
      .set('Authorization', 'Bearer tech-token')
      .expect(200);

    expect(executorCustodyServiceMock.getCustody).toHaveBeenCalledTimes(1);
  });

  it('rechaza 403 a un rol sin permisos de lectura de inventario (SALES)', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/inventory/custody?responsibleRefId=${RESPONSIBLE_ID}`)
      .set('Authorization', 'Bearer sales-token')
      .expect(403);

    expect(executorCustodyServiceMock.getCustody).not.toHaveBeenCalled();
  });

  it('rechaza 401 sin token', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/inventory/custody?responsibleRefId=${RESPONSIBLE_ID}`)
      .expect(401);

    expect(executorCustodyServiceMock.getCustody).not.toHaveBeenCalled();
  });
});
