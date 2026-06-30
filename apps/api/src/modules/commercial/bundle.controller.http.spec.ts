import {
  ForbiddenException,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { CustomerSegment, DiscountType, UserRole } from '@iwana/shared';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BundleController } from './controllers/bundle.controller';
import { BundleService } from './services/bundle.service';

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

      const req = context.switchToHttp().getRequest();
      const authHeader = req.headers.authorization;

      if (authHeader === 'Bearer sales-token') {
        req.user = {
          id: 'usr-sales',
          sub: 'usr-sales',
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

      req.user = {
        id: 'usr-admin',
        sub: 'usr-admin',
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
      const req = context.switchToHttp().getRequest();
      const user = req.user;
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

describe('BundleController HTTP', () => {
  let app: INestApplication;

  const bundleServiceMock = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deactivate: jest.fn(),
    calculatePrice: jest.fn(),
  };

  const BUNDLE_ID = '11111111-1111-4111-8111-111111111111';
  const ITEM_ID_1 = '22222222-2222-4222-8222-222222222222';
  const ITEM_ID_2 = '33333333-3333-4333-8333-333333333333';

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [BundleController],
      providers: [
        { provide: BundleService, useValue: bundleServiceMock },
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

  it('GET /api/v1/commercial/bundles retorna lista de bundles', async () => {
    const bundles = [{ id: BUNDLE_ID, name: 'Triple Play', isActive: true }];
    bundleServiceMock.findAll.mockResolvedValue(bundles);

    await request(app.getHttpServer())
      .get('/api/v1/commercial/bundles')
      .set('Authorization', 'Bearer sales-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toHaveLength(1);
        expect(body.data[0].id).toBe(BUNDLE_ID);
      });

    expect(bundleServiceMock.findAll).toHaveBeenCalled();
  });

  it('GET /api/v1/commercial/bundles retorna 401 sin JWT', async () => {
    await request(app.getHttpServer()).get('/api/v1/commercial/bundles').expect(401);
  });

  it('GET /api/v1/commercial/bundles/:id retorna bundle por ID', async () => {
    bundleServiceMock.findOne.mockResolvedValue({
      id: BUNDLE_ID,
      name: 'Triple Play',
      items: [],
    });

    await request(app.getHttpServer())
      .get(`/api/v1/commercial/bundles/${BUNDLE_ID}`)
      .set('Authorization', 'Bearer sales-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.id).toBe(BUNDLE_ID);
      });
  });

  it('POST /api/v1/commercial/bundles crea bundle y devuelve 201', async () => {
    bundleServiceMock.create.mockResolvedValue({ id: BUNDLE_ID, name: 'Duo Digital' });

    await request(app.getHttpServer())
      .post('/api/v1/commercial/bundles')
      .set('Authorization', 'Bearer admin-token')
      .send({
        name: 'Duo Digital',
        discountType: DiscountType.PERCENTAGE,
        discountValue: '10.00',
        validFrom: new Date().toISOString(),
        itemIds: [ITEM_ID_1, ITEM_ID_2],
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data.id).toBe(BUNDLE_ID);
      });

    expect(bundleServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Duo Digital', discountType: DiscountType.PERCENTAGE }),
    );
  });

  it('POST /api/v1/commercial/bundles rechaza payload inválido con 400', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/commercial/bundles')
      .set('Authorization', 'Bearer admin-token')
      .send({ name: 'Sin items' }) // falta discountType, discountValue, validFrom, itemIds
      .expect(400);

    expect(bundleServiceMock.create).not.toHaveBeenCalled();
  });

  it('POST /api/v1/commercial/bundles retorna 403 con rol SALES', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/commercial/bundles')
      .set('Authorization', 'Bearer sales-token')
      .send({
        name: 'Bundle Prohibido',
        discountType: DiscountType.PERCENTAGE,
        discountValue: '10.00',
        validFrom: new Date().toISOString(),
        itemIds: [ITEM_ID_1, ITEM_ID_2],
      })
      .expect(403);
  });

  it('PATCH /api/v1/commercial/bundles/:id actualiza bundle', async () => {
    bundleServiceMock.update.mockResolvedValue({ id: BUNDLE_ID, name: 'Bundle Actualizado' });

    await request(app.getHttpServer())
      .patch(`/api/v1/commercial/bundles/${BUNDLE_ID}`)
      .set('Authorization', 'Bearer admin-token')
      .send({ name: 'Bundle Actualizado' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.name).toBe('Bundle Actualizado');
      });

    expect(bundleServiceMock.update).toHaveBeenCalledWith(
      BUNDLE_ID,
      expect.objectContaining({ name: 'Bundle Actualizado' }),
    );
  });

  it('DELETE /api/v1/commercial/bundles/:id desactiva bundle', async () => {
    bundleServiceMock.deactivate.mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .delete(`/api/v1/commercial/bundles/${BUNDLE_ID}`)
      .set('Authorization', 'Bearer admin-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body.message).toBe('Bundle desactivado');
      });

    expect(bundleServiceMock.deactivate).toHaveBeenCalledWith(BUNDLE_ID);
  });

  it('GET /api/v1/commercial/bundles/:id/price calcula precio para segmento', async () => {
    bundleServiceMock.calculatePrice.mockResolvedValue({
      bundleId: BUNDLE_ID,
      originalTotal: 100000,
      discountAmount: 10000,
      finalTotal: 90000,
    });

    await request(app.getHttpServer())
      .get(`/api/v1/commercial/bundles/${BUNDLE_ID}/price?segment=${CustomerSegment.RESIDENTIAL}`)
      .set('Authorization', 'Bearer sales-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.finalTotal).toBe(90000);
      });

    expect(bundleServiceMock.calculatePrice).toHaveBeenCalledWith(
      BUNDLE_ID,
      CustomerSegment.RESIDENTIAL,
      [],
    );
  });
});
