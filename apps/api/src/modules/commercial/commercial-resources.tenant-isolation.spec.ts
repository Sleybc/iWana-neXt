import {
  ForbiddenException,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { UserRole } from '@iwana/shared';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BundleController } from './controllers/bundle.controller';
import { PromotionController } from './controllers/promotion.controller';
import { CommercialDashboardController } from './controllers/commercial-dashboard.controller';
import { CommercialPickerSearchController } from './controllers/commercial-picker-search.controller';
import { CompatibilityController } from './controllers/compatibility.controller';
import { BundleService } from './services/bundle.service';
import { PromotionService } from './services/promotion.service';
import { CommercialDashboardService } from './services/commercial-dashboard.service';
import { CatalogService } from './services/catalog.service';
import { CompatibilityService } from './services/compatibility.service';
import { ITaxApplicationReadPort } from '../taxation/ports/tax-application-read.port';

type TenantCtx = { tenantId: string; schemaName: string };

const schemaCalls: string[] = [];
let activeTenantContext: TenantCtx = { tenantId: 'tenant-a-id', schemaName: 'tenant_a' };

const mockRunInTenantSchema = jest.fn();

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    runInTenantSchema: (...args: Parameters<typeof mockRunInTenantSchema>) =>
      mockRunInTenantSchema(...args),
    TenantContext: {
      ...(actual.TenantContext as Record<string, unknown>),
      getOrThrow: () => activeTenantContext,
    },
  };
});

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
      if (isPublic) return true;

      const request = context.switchToHttp().getRequest();
      const authHeader = request.headers.authorization;

      if (authHeader === 'Bearer tenant-a-token') {
        activeTenantContext = { tenantId: 'tenant-a-id', schemaName: 'tenant_a' };
        request.user = {
          id: 'usr-tenant-a',
          sub: 'usr-tenant-a',
          email: 'hash-tenant-a',
          role: UserRole.ADMIN,
          tenantId: 'tenant-a-id',
          schemaName: 'tenant_a',
          jti: 'jti-tenant-a',
          type: 'tenant',
        };
        return true;
      }

      if (authHeader === 'Bearer tenant-b-token') {
        activeTenantContext = { tenantId: 'tenant-b-id', schemaName: 'tenant_b' };
        request.user = {
          id: 'usr-tenant-b',
          sub: 'usr-tenant-b',
          email: 'hash-tenant-b',
          role: UserRole.ADMIN,
          tenantId: 'tenant-b-id',
          schemaName: 'tenant_b',
          jti: 'jti-tenant-b',
          type: 'tenant',
        };
        return true;
      }

      throw new UnauthorizedException('Token de acceso invalido o expirado.');
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
      if (requiredRoles.length === 0) return true;
      if (!user || !requiredRoles.includes(user.role)) {
        throw new ForbiddenException('No tiene permisos para ejecutar esta acción.');
      }
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

const sharedId = '11111111-1111-4111-8111-111111111111';
const exclusiveBId = '22222222-2222-4222-8222-222222222222';

const bundles = [
  { id: sharedId, tenantId: 'tenant-a-id', name: 'Combo A' },
  { id: sharedId, tenantId: 'tenant-b-id', name: 'Combo B' },
  { id: exclusiveBId, tenantId: 'tenant-b-id', name: 'Combo exclusivo B' },
];

const promotions = [
  { id: sharedId, tenantId: 'tenant-a-id', name: 'Promo A', code: 'PROMO-A' },
  { id: sharedId, tenantId: 'tenant-b-id', name: 'Promo B', code: 'PROMO-B' },
  { id: exclusiveBId, tenantId: 'tenant-b-id', name: 'Promo exclusiva B', code: 'PROMO-B-EX' },
];

const taxApplications = [
  { id: sharedId, tenantId: 'tenant-a-id', isActive: true },
  { id: sharedId, tenantId: 'tenant-b-id', isActive: true },
  { id: exclusiveBId, tenantId: 'tenant-b-id', isActive: true },
];

const compatibilityRules = [
  { id: sharedId, tenantId: 'tenant-a-id', isActive: true },
  { id: sharedId, tenantId: 'tenant-b-id', isActive: true },
  { id: exclusiveBId, tenantId: 'tenant-b-id', isActive: true },
];

function buildManager() {
  return {
    findOne: jest
      .fn()
      .mockImplementation(
        async (entity: { name?: string }, options?: { where?: Record<string, unknown> }) => {
          const where = options?.where ?? {};
          if (entity?.name === 'CatalogBundle') {
            return (
              bundles.find((row) => row.id === where['id'] && row.tenantId === where['tenantId']) ??
              null
            );
          }
          if (entity?.name === 'CatalogPromotion') {
            return (
              promotions.find(
                (row) => row.id === where['id'] && row.tenantId === where['tenantId'],
              ) ?? null
            );
          }
          if (entity?.name === 'TaxRuleApplication') {
            return (
              taxApplications.find(
                (row) => row.id === where['id'] && row.tenantId === where['tenantId'],
              ) ?? null
            );
          }
          if (entity?.name === 'CompatibilityRule') {
            return (
              compatibilityRules.find(
                (row) => row.id === where['id'] && row.tenantId === where['tenantId'],
              ) ?? null
            );
          }
          return null;
        },
      ),
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockImplementation(async (_entity: unknown, row: unknown) => row),
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      getCount: jest.fn().mockResolvedValue(0),
      clone: jest.fn().mockReturnThis(),
    }),
    query: jest.fn().mockResolvedValue([{ count: 0, total: 0, active: 0 }]),
  };
}

describe('Commercial resources tenant isolation', () => {
  let app: INestApplication;

  beforeAll(async () => {
    mockRunInTenantSchema.mockImplementation(
      async (
        _ds: DataSource,
        schemaName: string,
        callback: (qr: { manager: ReturnType<typeof buildManager> }) => Promise<unknown>,
      ) => {
        schemaCalls.push(schemaName);
        return callback({ manager: buildManager() });
      },
    );

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [
        BundleController,
        PromotionController,
        CommercialDashboardController,
        CommercialPickerSearchController,
        CompatibilityController,
      ],
      providers: [
        BundleService,
        PromotionService,
        CommercialDashboardService,
        CatalogService,
        CompatibilityService,
        {
          provide: ITaxApplicationReadPort,
          useValue: { hasActiveCoverage: jest.fn().mockResolvedValue(true), resolve: jest.fn() },
        },
        { provide: DataSource, useValue: {} },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        JwtAuthGuard,
        RolesGuard,
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
    schemaCalls.length = 0;
    activeTenantContext = { tenantId: 'tenant-a-id', schemaName: 'tenant_a' };
  });

  it('resuelve el mismo id de bundle en el schema del tenant A', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/commercial/bundles/${sharedId}`)
      .set('Authorization', 'Bearer tenant-a-token')
      .expect(200);

    expect(response.body.data.name).toBe('Combo A');
    expect(schemaCalls).toEqual(['tenant_a']);
  });

  it('no permite leer desde tenant A un bundle exclusivo de tenant B', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/commercial/bundles/${exclusiveBId}`)
      .set('Authorization', 'Bearer tenant-a-token')
      .expect(404);
    expect(schemaCalls).toEqual(['tenant_a']);
  });

  it('resuelve el mismo id de promoción en el schema del tenant B', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/commercial/promotions/${sharedId}`)
      .set('Authorization', 'Bearer tenant-b-token')
      .expect(200);

    expect(response.body.data.name).toBe('Promo B');
    expect(schemaCalls).toEqual(['tenant_b']);
  });

  it('no permite leer desde tenant A una promoción exclusiva de tenant B', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/commercial/promotions/${exclusiveBId}`)
      .set('Authorization', 'Bearer tenant-a-token')
      .expect(404);
    expect(schemaCalls).toEqual(['tenant_a']);
  });

  it('abre el dashboard en el schema del tenant B', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/commercial/dashboard/summary')
      .set('Authorization', 'Bearer tenant-b-token')
      .expect(200);
    expect(schemaCalls).toEqual(['tenant_b']);
  });

  it('busca en picker sobre el schema del tenant autenticado', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/commercial/plans/search?q=fibra')
      .set('Authorization', 'Bearer tenant-a-token')
      .expect(200);
    expect(schemaCalls).toEqual(['tenant_a']);
  });

  it('lista reglas de compatibilidad en el schema del tenant B', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/commercial/compatibility-rules')
      .set('Authorization', 'Bearer tenant-b-token')
      .expect(200);
    expect(schemaCalls).toEqual(['tenant_b']);
  });

  it('no permite a tenant A desactivar una regla de compatibilidad exclusiva de tenant B', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/commercial/compatibility-rules/${exclusiveBId}`)
      .set('Authorization', 'Bearer tenant-a-token')
      .send({ isActive: false })
      .expect(404);
    expect(schemaCalls).toEqual(['tenant_a']);
  });
});
