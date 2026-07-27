import {
  ForbiddenException,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import {
  CatalogItemType,
  CustomerSegment,
  InstallationRule,
  ProductCategory,
  UserRole,
} from '@iwana/shared';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CatalogController } from './controllers/catalog.controller';
import { CatalogService } from './services/catalog.service';
import { PriceHistoryService } from './services/price-history.service';

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

describe('CatalogController HTTP', () => {
  let app: INestApplication;

  const catalogServiceMock = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  const priceHistoryServiceMock = {
    getPriceHistory: jest.fn(),
    getCurrentPrice: jest.fn(),
    createPrice: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [CatalogController],
      providers: [
        { provide: CatalogService, useValue: catalogServiceMock },
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
    jest.clearAllMocks();
  });

  it('GET /api/v1/commercial/catalog retorna lista paginada y propaga filtros', async () => {
    catalogServiceMock.findAll.mockResolvedValue({
      data: [],
      meta: { nextCursor: null, total: 0 },
    });

    await request(app.getHttpServer())
      .get('/api/v1/commercial/catalog?type=PLAN&name=fibra&limit=5&isActive=true')
      .set('Authorization', 'Bearer sales-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.meta.total).toBe(0);
        expect(body.data.meta.nextCursor).toBeNull();
        expect(Array.isArray(body.data.data)).toBe(true);
      });

    expect(catalogServiceMock.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        type: CatalogItemType.PLAN,
        name: 'fibra',
        limit: 5,
        isActive: true,
      }),
    );
  });

  it('GET /api/v1/commercial/catalog aplica limit default 20 si se omite', async () => {
    catalogServiceMock.findAll.mockResolvedValue({
      data: [],
      meta: { nextCursor: null, total: 0 },
    });

    await request(app.getHttpServer())
      .get('/api/v1/commercial/catalog?type=PLAN')
      .set('Authorization', 'Bearer sales-token')
      .expect(200);

    expect(catalogServiceMock.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        type: CatalogItemType.PLAN,
        limit: 20,
      }),
    );
  });

  it('GET /api/v1/commercial/catalog retorna 401 sin JWT', async () => {
    await request(app.getHttpServer()).get('/api/v1/commercial/catalog').expect(401);
  });

  it('POST /api/v1/commercial/catalog/plans crea plan y fuerza type PLAN', async () => {
    catalogServiceMock.create.mockResolvedValue({ id: 'plan-1', type: CatalogItemType.PLAN });

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
      .expect(201)
      .expect(({ body }) => {
        expect(body.data.id).toBe('plan-1');
      });

    expect(catalogServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: CatalogItemType.PLAN,
        name: 'Plan Fibra 300',
      }),
    );
  });

  it('POST /api/v1/commercial/catalog/products valida payload segun DTO', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/commercial/catalog/products')
      .set('Authorization', 'Bearer admin-token')
      .send({
        name: 'Router WiFi 6',
        category: 'INVALID_CATEGORY',
      })
      .expect(400);

    expect(catalogServiceMock.create).not.toHaveBeenCalled();
  });

  it('POST /api/v1/commercial/catalog/products crea producto comercial', async () => {
    catalogServiceMock.create.mockResolvedValue({ id: 'prod-1', type: CatalogItemType.PRODUCT });

    await request(app.getHttpServer())
      .post('/api/v1/commercial/catalog/products')
      .set('Authorization', 'Bearer admin-token')
      .send({
        name: 'Router WiFi 6',
        category: ProductCategory.CPE,
        isLoan: true,
        requiresInventory: true,
      })
      .expect(201);

    expect(catalogServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: CatalogItemType.PRODUCT,
        category: ProductCategory.CPE,
      }),
    );
  });

  it('GET /api/v1/commercial/catalog/:id/price consulta precio vigente por segmento', async () => {
    priceHistoryServiceMock.getCurrentPrice.mockResolvedValue({ basePrice: '89900.00' });

    await request(app.getHttpServer())
      .get(
        '/api/v1/commercial/catalog/11111111-1111-1111-1111-111111111111/price?segment=RESIDENTIAL',
      )
      .set('Authorization', 'Bearer sales-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.basePrice).toBe('89900.00');
      });

    expect(priceHistoryServiceMock.getCurrentPrice).toHaveBeenCalledWith(
      '11111111-1111-1111-1111-111111111111',
      CustomerSegment.RESIDENTIAL,
    );
  });

  it('POST /api/v1/commercial/catalog/:id/prices registra un precio SCD con actor autenticado', async () => {
    priceHistoryServiceMock.createPrice.mockResolvedValue({ id: 'price-1' });

    await request(app.getHttpServer())
      .post('/api/v1/commercial/catalog/11111111-1111-1111-1111-111111111111/prices')
      .set('Authorization', 'Bearer admin-token')
      .send({
        customerSegment: CustomerSegment.RESIDENTIAL,
        basePrice: '89900.00',
        installationFee: '0.00',
      })
      .expect(201);

    expect(priceHistoryServiceMock.createPrice).toHaveBeenCalledWith(
      '11111111-1111-1111-1111-111111111111',
      {
        customerSegment: CustomerSegment.RESIDENTIAL,
        basePrice: '89900.00',
        installationFee: '0.00',
      },
      'usr-admin-sub',
    );
  });
});
