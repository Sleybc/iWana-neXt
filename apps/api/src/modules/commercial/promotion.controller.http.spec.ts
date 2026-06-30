import {
  ForbiddenException,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DiscountType, UserRole } from '@iwana/shared';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PromotionController } from './controllers/promotion.controller';
import { PromotionService } from './services/promotion.service';

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

      req.user = {
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

describe('PromotionController HTTP', () => {
  let app: INestApplication;

  const promotionServiceMock = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deactivate: jest.fn(),
  };

  const PROMO_ID = '44444444-4444-4444-4444-444444444444';

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [PromotionController],
      providers: [
        { provide: PromotionService, useValue: promotionServiceMock },
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

  it('GET /api/v1/commercial/promotions retorna lista de promociones activas', async () => {
    promotionServiceMock.findAll.mockResolvedValue([
      { id: PROMO_ID, code: 'BIENVENIDA', isActive: true },
    ]);

    await request(app.getHttpServer())
      .get('/api/v1/commercial/promotions')
      .set('Authorization', 'Bearer sales-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toHaveLength(1);
        expect(body.data[0].code).toBe('BIENVENIDA');
      });

    expect(promotionServiceMock.findAll).toHaveBeenCalled();
  });

  it('GET /api/v1/commercial/promotions retorna 401 sin JWT', async () => {
    await request(app.getHttpServer()).get('/api/v1/commercial/promotions').expect(401);
  });

  it('GET /api/v1/commercial/promotions/:id retorna promoción por ID', async () => {
    promotionServiceMock.findOne.mockResolvedValue({ id: PROMO_ID, code: 'BIENVENIDA' });

    await request(app.getHttpServer())
      .get(`/api/v1/commercial/promotions/${PROMO_ID}`)
      .set('Authorization', 'Bearer sales-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.id).toBe(PROMO_ID);
      });
  });

  it('POST /api/v1/commercial/promotions crea promoción y devuelve 201', async () => {
    promotionServiceMock.create.mockResolvedValue({ id: PROMO_ID, code: 'VERANO25' });

    const futureFrom = new Date(Date.now() + 3600_000).toISOString();
    const futureTo = new Date(Date.now() + 86400_000).toISOString();

    await request(app.getHttpServer())
      .post('/api/v1/commercial/promotions')
      .set('Authorization', 'Bearer admin-token')
      .send({
        name: 'Promo Verano',
        code: 'VERANO25',
        discountType: DiscountType.PERCENTAGE,
        discountValue: '25.00',
        appliesTo: 'ITEM',
        validFrom: futureFrom,
        validTo: futureTo,
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data.code).toBe('VERANO25');
      });

    // El controller debe pasar req.user.sub como segundo argumento
    expect(promotionServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'VERANO25' }),
      'usr-admin-sub',
    );
  });

  it('POST /api/v1/commercial/promotions retorna 403 con rol SALES', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/commercial/promotions')
      .set('Authorization', 'Bearer sales-token')
      .send({ name: 'Promo Prohibida' })
      .expect(403);
  });

  it('POST /api/v1/commercial/promotions rechaza payload inválido con 400', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/commercial/promotions')
      .set('Authorization', 'Bearer admin-token')
      .send({ name: 'Sin campos requeridos' }) // falta discountType, discountValue, etc.
      .expect(400);

    expect(promotionServiceMock.create).not.toHaveBeenCalled();
  });

  it('PATCH /api/v1/commercial/promotions/:id actualiza promoción', async () => {
    promotionServiceMock.update.mockResolvedValue({ id: PROMO_ID, name: 'Promo Actualizada' });

    await request(app.getHttpServer())
      .patch(`/api/v1/commercial/promotions/${PROMO_ID}`)
      .set('Authorization', 'Bearer admin-token')
      .send({ name: 'Promo Actualizada' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.name).toBe('Promo Actualizada');
      });

    expect(promotionServiceMock.update).toHaveBeenCalledWith(
      PROMO_ID,
      expect.objectContaining({ name: 'Promo Actualizada' }),
    );
  });

  it('DELETE /api/v1/commercial/promotions/:id desactiva promoción', async () => {
    promotionServiceMock.deactivate.mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .delete(`/api/v1/commercial/promotions/${PROMO_ID}`)
      .set('Authorization', 'Bearer admin-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body.message).toMatch(/desactivad/i);
      });

    expect(promotionServiceMock.deactivate).toHaveBeenCalledWith(PROMO_ID);
  });
});
