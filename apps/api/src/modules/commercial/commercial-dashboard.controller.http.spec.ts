import {
  ForbiddenException,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { UserRole } from '@iwana/shared';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../access-control/guards/permissions.guard';
import { CommercialDashboardController } from './controllers/commercial-dashboard.controller';
import { CommercialDashboardService } from './services/commercial-dashboard.service';

jest.mock('../auth/guards/jwt-auth.guard', () => ({
  JwtAuthGuard: class JwtAuthGuard {
    canActivate(context: {
      getHandler: () => unknown;
      getClass: () => unknown;
      switchToHttp: () => {
        getRequest: () => {
          headers: Record<string, string | undefined>;
          user?: JwtPayload & { id?: string };
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

      const request = context.switchToHttp().getRequest();
      const authHeader = request.headers.authorization;

      if (authHeader === 'Bearer sales-token') {
        request.user = {
          id: 'legacy-sales-id',
          sub: 'usr-sales-sub',
          email: 'hash-sales',
          role: UserRole.SALES,
          tenantId: 'tenant-test',
          schemaName: 'tenant_test',
          jti: 'jti-sales',
          type: 'tenant',
        };
        return true;
      }

      if (authHeader !== 'Bearer admin-token') {
        throw new UnauthorizedException('Token de acceso invalido o expirado.');
      }

      request.user = {
        id: 'legacy-admin-id',
        sub: 'usr-admin-sub',
        email: 'hash-admin',
        role: UserRole.ADMIN,
        tenantId: 'tenant-test',
        schemaName: 'tenant_test',
        jti: 'jti-admin',
        type: 'tenant',
      };
      return true;
    }
  },
}));

jest.mock('../access-control/guards/permissions.guard', () => ({
  PermissionsGuard: class PermissionsGuard {
    canActivate() {
      return true;
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
      const request = context.switchToHttp().getRequest();
      const user = request.user;
      const requiredRoles: string[] =
        Reflect.getMetadata('roles', context.getHandler() as object) ??
        Reflect.getMetadata('roles', context.getClass() as object) ??
        [];

      if (requiredRoles.length === 0) {
        return true;
      }

      if (!user || !requiredRoles.includes(user.role)) {
        throw new ForbiddenException('No tiene permisos para ejecutar esta acción.');
      }

      return true;
    }
  },
}));

describe('CommercialDashboardController HTTP', () => {
  let app: INestApplication;

  const summaryMock = {
    plansCount: 3,
    activePlansCount: 2,
    productsCount: 4,
    activeProductsCount: 3,
    servicesCount: 2,
    activeServicesCount: 2,
    bundlesCount: 1,
    activeBundlesCount: 1,
    promotionsCount: 2,
    activePromotionsCount: 1,
    compatibilityRulesCount: 5,
    activeCompatibilityRulesCount: 4,
    taxRulesCount: 6,
    activeTaxRulesCount: 5,
    offersExpiringSoonCount: 1,
    offersNearUseLimitCount: 0,
    offersAtRiskCount: 1,
    catalogActiveCount: 7,
    catalogSellableActiveCount: 6,
    catalogIncompleteActiveCount: 1,
    missingCurrentPriceCount: 1,
    activeBundlesWithInactiveItemsCount: 0,
    taxRulesCoverageGapCount: 0,
    rulesGapCount: 0,
    activeOffersCount: 2,
    attentionItems: [
      {
        id: 'plan-incomplete',
        entityType: 'plan',
        name: 'Plan sin precio',
        reason: 'missing_current_price',
        destinoTab: 'plans',
        validTo: null,
        usesRemaining: null,
      },
    ],
    recentChanges: [
      {
        occurredAt: '2026-07-22T15:00:00.000Z',
        action: 'created',
        entityType: 'plan',
        entityName: 'Plan fibra',
        destinoTab: 'plans',
      },
    ],
  };

  const commercialDashboardServiceMock = {
    getSummary: jest.fn().mockResolvedValue(summaryMock),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [CommercialDashboardController],
      providers: [
        { provide: CommercialDashboardService, useValue: commercialDashboardServiceMock },
        JwtAuthGuard,
        RolesGuard,
        PermissionsGuard,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    commercialDashboardServiceMock.getSummary.mockResolvedValue(summaryMock);
  });

  it('GET /commercial/dashboard/summary retorna KPIs para ADMIN', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/commercial/dashboard/summary')
      .set('Authorization', 'Bearer admin-token')
      .expect(200);

    expect(response.body).toEqual(summaryMock);
    expect(response.body).toMatchObject({
      plansCount: 3,
      activePlansCount: 2,
      offersAtRiskCount: 1,
      catalogSellableActiveCount: 6,
      taxRulesCoverageGapCount: 0,
      activeOffersCount: 2,
    });
    expect(response.body.attentionItems).toHaveLength(1);
    expect(response.body.recentChanges).toHaveLength(1);
    expect(response.body.recentChanges[0]).toMatchObject({
      action: 'created',
      entityType: 'plan',
      destinoTab: 'plans',
    });
    expect(response.body.recentChanges[0]).not.toHaveProperty('userId');
    expect(response.body.recentChanges[0]).not.toHaveProperty('changedBy');
    expect(response.body).not.toHaveProperty('missingTaxClassificationCount');
    expect(commercialDashboardServiceMock.getSummary).toHaveBeenCalledTimes(1);
  });

  it('GET /commercial/dashboard/summary permite SALES', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/commercial/dashboard/summary')
      .set('Authorization', 'Bearer sales-token')
      .expect(200);
  });

  it('GET /commercial/dashboard/summary rechaza peticiones sin token', async () => {
    await request(app.getHttpServer()).get('/api/v1/commercial/dashboard/summary').expect(401);
  });
});
