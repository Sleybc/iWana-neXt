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
import { CatalogItemType, CustomerSegment, InstallationRule, UserRole } from '@iwana/shared';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CatalogController } from './controllers/catalog.controller';
import { CatalogService } from './services/catalog.service';
import { PriceHistoryService } from './services/price-history.service';

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

      if (isPublic) {
        return true;
      }

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

jest.mock('../access-control/guards/permissions.guard', () => ({
  PermissionsGuard: class PermissionsGuard {
    canActivate() {
      return true;
    }
  },
}));

const sharedItemId = '11111111-1111-4111-8111-111111111111';
const exclusiveTenantBItemId = '22222222-2222-4222-8222-222222222222';

const catalogItems = [
  {
    id: sharedItemId,
    tenantId: 'tenant-a-id',
    type: CatalogItemType.PLAN,
    name: 'Plan Fibra 300 A',
    description: null,
    taxClassificationId: null,
    retentionApplicable: false,
    isActive: true,
    deletedAt: null,
    createdAt: new Date('2026-04-18T10:00:00Z'),
    updatedAt: new Date('2026-04-18T10:00:00Z'),
  },
  {
    id: sharedItemId,
    tenantId: 'tenant-b-id',
    type: CatalogItemType.PLAN,
    name: 'Plan Fibra 300 B',
    description: null,
    taxClassificationId: null,
    retentionApplicable: false,
    isActive: true,
    deletedAt: null,
    createdAt: new Date('2026-04-18T10:00:00Z'),
    updatedAt: new Date('2026-04-18T10:00:00Z'),
  },
  {
    id: exclusiveTenantBItemId,
    tenantId: 'tenant-b-id',
    type: CatalogItemType.PLAN,
    name: 'Plan Corporativo B',
    description: null,
    taxClassificationId: null,
    retentionApplicable: true,
    isActive: true,
    deletedAt: null,
    createdAt: new Date('2026-04-18T10:00:00Z'),
    updatedAt: new Date('2026-04-18T10:00:00Z'),
  },
];

const planDetails = {
  [sharedItemId]: {
    itemId: sharedItemId,
    technology: 'FTTH',
    downloadSpeedMbps: 300,
    uploadSpeedMbps: 300,
    installationRule: InstallationRule.ON_DEMAND,
  },
  [exclusiveTenantBItemId]: {
    itemId: exclusiveTenantBItemId,
    technology: 'XGS-PON',
    downloadSpeedMbps: 800,
    uploadSpeedMbps: 800,
    installationRule: InstallationRule.ALWAYS,
  },
} as const;

const currentPrices = {
  [sharedItemId]: {
    itemId: sharedItemId,
    customerSegment: CustomerSegment.RESIDENTIAL,
    basePrice: '89900.00',
    installationFee: '0.00',
    isCurrent: true,
  },
  [exclusiveTenantBItemId]: {
    itemId: exclusiveTenantBItemId,
    customerSegment: CustomerSegment.RESIDENTIAL,
    basePrice: '159900.00',
    installationFee: '120000.00',
    isCurrent: true,
  },
} as const;

function buildManager() {
  return {
    findOne: jest
      .fn()
      .mockImplementation(
        async (entity: { name?: string }, options?: { where?: Record<string, unknown> }) => {
          if (entity?.name === 'CatalogItem') {
            const where = options?.where ?? {};
            return (
              catalogItems.find(
                (item) =>
                  item.id === where['id'] &&
                  item.tenantId === where['tenantId'] &&
                  item.deletedAt === null,
              ) ?? null
            );
          }

          return null;
        },
      ),
    createQueryBuilder: jest.fn().mockImplementation((_entity: unknown, alias?: string) => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockImplementation(async () => {
        if (alias === 'pd') return Object.values(planDetails);
        if (alias === 'ph') return Object.values(currentPrices);
        return [];
      }),
    })),
  };
}

describe('CatalogController tenant isolation', () => {
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

    const priceHistoryServiceMock = {
      getPriceHistory: jest.fn(),
      getCurrentPrice: jest.fn(),
      createPrice: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [CatalogController],
      providers: [
        CatalogService,
        { provide: DataSource, useValue: {} },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: PriceHistoryService, useValue: priceHistoryServiceMock },
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

  it('resuelve el mismo id de catálogo dentro del schema del tenant A', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/commercial/catalog/${sharedItemId}`)
      .set('Authorization', 'Bearer tenant-a-token')
      .expect(200);

    expect(response.body.data.name).toBe('Plan Fibra 300 A');
    expect(response.body.data.currentPrice).toBe('89900.00');
    expect(schemaCalls).toEqual(['tenant_a']);
  });

  it('resuelve el mismo id de catálogo dentro del schema del tenant B', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/commercial/catalog/${sharedItemId}`)
      .set('Authorization', 'Bearer tenant-b-token')
      .expect(200);

    expect(response.body.data.name).toBe('Plan Fibra 300 B');
    expect(schemaCalls).toEqual(['tenant_b']);
  });

  it('no permite leer desde tenant A un item que solo existe en tenant B', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/commercial/catalog/${exclusiveTenantBItemId}`)
      .set('Authorization', 'Bearer tenant-a-token')
      .expect(404);

    expect(schemaCalls).toEqual(['tenant_a']);
  });
});
