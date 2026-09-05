import { ForbiddenException, INestApplication, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AccessPermissionKey, InstallationRule, UserRole } from '@iwana/shared';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../access-control/guards/permissions.guard';
import { EffectivePermissionsService } from '../access-control/services/effective-permissions.service';
import { BundleController } from './controllers/bundle.controller';
import { CatalogController } from './controllers/catalog.controller';
import { CommercialDashboardController } from './controllers/commercial-dashboard.controller';
import { CommercialPickerSearchController } from './controllers/commercial-picker-search.controller';
import { CompatibilityController } from './controllers/compatibility.controller';
import { PromotionController } from './controllers/promotion.controller';
import { BundleService } from './services/bundle.service';
import { CatalogService } from './services/catalog.service';
import { CommercialDashboardService } from './services/commercial-dashboard.service';
import { CompatibilityService } from './services/compatibility.service';
import { PriceHistoryService } from './services/price-history.service';
import { PromotionService } from './services/promotion.service';

jest.mock('../auth/guards/jwt-auth.guard', () => ({
  JwtAuthGuard: class JwtAuthGuard {
    canActivate(context: {
      getHandler: () => unknown;
      getClass: () => unknown;
      switchToHttp: () => {
        getRequest: () => { headers: Record<string, string | undefined>; user?: JwtPayload };
      };
    }): boolean {
      const handler = context.getHandler() as object;
      const classRef = context.getClass() as object;
      const isPublic =
        Reflect.getMetadata(IS_PUBLIC_KEY, handler) ?? Reflect.getMetadata(IS_PUBLIC_KEY, classRef);
      if (isPublic) return true;
      const req = context.switchToHttp().getRequest();
      const tokens: Record<string, JwtPayload> = {
        'Bearer sales-token': {
          sub: 'sales-001',
          role: UserRole.SALES,
          tenantId: 't-001',
          schemaName: 't_001',
          type: 'tenant',
        } as JwtPayload,
        'Bearer auditor-token': {
          sub: 'auditor-001',
          role: UserRole.AUDITOR,
          tenantId: 't-001',
          schemaName: 't_001',
          type: 'tenant',
        } as JwtPayload,
        'Bearer admin-token': {
          sub: 'admin-001',
          role: UserRole.ADMIN,
          tenantId: 't-001',
          schemaName: 't_001',
          type: 'tenant',
        } as JwtPayload,
        'Bearer accountant-token': {
          sub: 'accountant-001',
          role: UserRole.ACCOUNTANT,
          tenantId: 't-001',
          schemaName: 't_001',
          type: 'tenant',
        } as JwtPayload,
      };
      const h = req.headers.authorization;
      if (h && tokens[h]) {
        req.user = tokens[h];
        return true;
      }
      throw new UnauthorizedException('Token inválido');
    }
  },
}));

jest.mock('../auth/guards/roles.guard', () => ({
  RolesGuard: class RolesGuard {
    canActivate(context: {
      switchToHttp: () => { getRequest: () => { user?: JwtPayload } };
      getHandler: () => unknown;
      getClass: () => unknown;
    }): boolean {
      const req = context.switchToHttp().getRequest();
      const user = req.user;
      const required: string[] =
        Reflect.getMetadata('roles', context.getHandler() as object) ??
        Reflect.getMetadata('roles', context.getClass() as object) ??
        [];
      if (required.length === 0) return true;
      if (!user || !required.includes(user.role)) {
        throw new ForbiddenException('No tiene permisos para ejecutar esta acción.');
      }
      return true;
    }
  },
}));

const EMPTY_LIST = { data: [], meta: { nextCursor: null, total: 0 } };

describe('Commercial controllers Fase 2 — doble guard', () => {
  let app: INestApplication;
  const permsMock = { getEffectivePermissionsForUser: jest.fn() };
  const catalogServiceMock = {
    findAll: jest.fn().mockResolvedValue(EMPTY_LIST),
    create: jest.fn().mockResolvedValue({ id: 'plan-1' }),
    searchForPicker: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  };
  const bundleServiceMock = { findAll: jest.fn().mockResolvedValue(EMPTY_LIST) };
  const promotionServiceMock = { findAll: jest.fn().mockResolvedValue(EMPTY_LIST) };
  const compatibilityServiceMock = { findAll: jest.fn().mockResolvedValue(EMPTY_LIST) };
  const dashboardServiceMock = { getSummary: jest.fn().mockResolvedValue({ kpis: {} }) };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [
        CatalogController,
        BundleController,
        PromotionController,
        CompatibilityController,
        CommercialPickerSearchController,
        CommercialDashboardController,
      ],
      providers: [
        { provide: CatalogService, useValue: catalogServiceMock },
        { provide: PriceHistoryService, useValue: {} },
        { provide: BundleService, useValue: bundleServiceMock },
        { provide: PromotionService, useValue: promotionServiceMock },
        { provide: CompatibilityService, useValue: compatibilityServiceMock },
        { provide: CommercialDashboardService, useValue: dashboardServiceMock },
        { provide: EffectivePermissionsService, useValue: permsMock },
        Reflector,
        PermissionsGuard,
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
    catalogServiceMock.findAll.mockResolvedValue(EMPTY_LIST);
    catalogServiceMock.create.mockResolvedValue({ id: 'plan-1' });
    catalogServiceMock.searchForPicker.mockResolvedValue({ data: [], total: 0 });
    bundleServiceMock.findAll.mockResolvedValue(EMPTY_LIST);
    promotionServiceMock.findAll.mockResolvedValue(EMPTY_LIST);
    compatibilityServiceMock.findAll.mockResolvedValue(EMPTY_LIST);
    dashboardServiceMock.getSummary.mockResolvedValue({ kpis: {} });
  });

  const readRoutes = [
    '/api/v1/commercial/catalog',
    '/api/v1/commercial/bundles',
    '/api/v1/commercial/promotions',
    '/api/v1/commercial/compatibility-rules',
    '/api/v1/commercial/plans/search',
    '/api/v1/commercial/dashboard/summary',
  ];

  it.each(readRoutes)('%s — 200 para AUDITOR con permiso', async (path) => {
    permsMock.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.COMMERCIAL_CATALOG_READ,
    ]);
    await request(app.getHttpServer())
      .get(path)
      .set('Authorization', 'Bearer auditor-token')
      .expect(200);
  });

  it.each(readRoutes)('%s — 403 para AUDITOR sin permiso', async (path) => {
    permsMock.getEffectivePermissionsForUser.mockResolvedValue([]);
    await request(app.getHttpServer())
      .get(path)
      .set('Authorization', 'Bearer auditor-token')
      .expect(403);
  });

  it('GET /commercial/catalog — 200 para ACCOUNTANT con permiso (matriz V2)', async () => {
    permsMock.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.COMMERCIAL_CATALOG_READ,
    ]);
    await request(app.getHttpServer())
      .get('/api/v1/commercial/catalog')
      .set('Authorization', 'Bearer accountant-token')
      .expect(200);
  });

  it('POST /commercial/catalog/plans — 201 para ADMIN con permiso', async () => {
    permsMock.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.COMMERCIAL_CATALOG_MANAGE,
    ]);
    await request(app.getHttpServer())
      .post('/api/v1/commercial/catalog/plans')
      .set('Authorization', 'Bearer admin-token')
      .send({
        name: 'Plan Fibra 300',
        technology: 'FTTH',
        downloadSpeedMbps: 300,
        uploadSpeedMbps: 300,
        installationRule: InstallationRule.ON_DEMAND,
      })
      .expect(201);
  });

  it('POST /commercial/catalog/plans — 403 para ADMIN sin permiso', async () => {
    permsMock.getEffectivePermissionsForUser.mockResolvedValue([]);
    await request(app.getHttpServer())
      .post('/api/v1/commercial/catalog/plans')
      .set('Authorization', 'Bearer admin-token')
      .send({
        name: 'Plan Fibra 300',
        technology: 'FTTH',
        downloadSpeedMbps: 300,
        uploadSpeedMbps: 300,
        installationRule: InstallationRule.ON_DEMAND,
      })
      .expect(403);
  });
});
