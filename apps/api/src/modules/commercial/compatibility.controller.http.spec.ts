import {
  ForbiddenException,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { CompatibilityRuleType, UserRole } from '@iwana/shared';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CompatibilityController } from './controllers/compatibility.controller';
import { CompatibilityService } from './services/compatibility.service';

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

describe('CompatibilityController HTTP', () => {
  let app: INestApplication;

  const compatibilityServiceMock = {
    findAll: jest.fn(),
    create: jest.fn(),
    deactivate: jest.fn(),
    validateCombination: jest.fn(),
    update: jest.fn(),
  };

  const RULE_ID = '55555555-5555-4555-8555-555555555555';
  const ITEM_ID_A = '66666666-6666-4666-8666-666666666666';
  const ITEM_ID_B = '77777777-7777-4777-8777-777777777777';

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [CompatibilityController],
      providers: [
        { provide: CompatibilityService, useValue: compatibilityServiceMock },
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

  it('GET /api/v1/commercial/compatibility-rules retorna lista paginada de reglas activas', async () => {
    compatibilityServiceMock.findAll.mockResolvedValue({
      data: [{ id: RULE_ID, ruleType: CompatibilityRuleType.EXCLUDES, isActive: true }],
      meta: { nextCursor: null, total: 1 },
    });

    await request(app.getHttpServer())
      .get('/api/v1/commercial/compatibility-rules')
      .set('Authorization', 'Bearer sales-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toHaveLength(1);
        expect(body.data[0].id).toBe(RULE_ID);
        expect(body.meta.total).toBe(1);
        expect(body.meta.nextCursor).toBeNull();
      });

    expect(compatibilityServiceMock.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20 }),
    );
  });

  it('GET /api/v1/commercial/compatibility-rules retorna 401 sin JWT', async () => {
    await request(app.getHttpServer()).get('/api/v1/commercial/compatibility-rules').expect(401);
  });

  it('POST /api/v1/commercial/compatibility-rules crea regla de compatibilidad', async () => {
    compatibilityServiceMock.create.mockResolvedValue({
      id: RULE_ID,
      ruleType: CompatibilityRuleType.EXCLUDES,
    });

    await request(app.getHttpServer())
      .post('/api/v1/commercial/compatibility-rules')
      .set('Authorization', 'Bearer admin-token')
      .send({
        ruleType: CompatibilityRuleType.EXCLUDES,
        sourceItemId: ITEM_ID_A,
        targetItemId: ITEM_ID_B,
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data.id).toBe(RULE_ID);
      });

    expect(compatibilityServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ ruleType: CompatibilityRuleType.EXCLUDES }),
    );
  });

  it('POST /api/v1/commercial/compatibility-rules rechaza payload inválido con 400', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/commercial/compatibility-rules')
      .set('Authorization', 'Bearer admin-token')
      .send({ ruleType: 'TIPO_INVALIDO', sourceItemId: ITEM_ID_A, targetItemId: ITEM_ID_B })
      .expect(400);

    expect(compatibilityServiceMock.create).not.toHaveBeenCalled();
  });

  it('POST /api/v1/commercial/compatibility-rules retorna 403 con rol SALES', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/commercial/compatibility-rules')
      .set('Authorization', 'Bearer sales-token')
      .send({
        ruleType: CompatibilityRuleType.EXCLUDES,
        sourceItemId: ITEM_ID_A,
        targetItemId: ITEM_ID_B,
      })
      .expect(403);
  });

  it('DELETE /api/v1/commercial/compatibility-rules/:id desactiva regla', async () => {
    compatibilityServiceMock.deactivate.mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .delete(`/api/v1/commercial/compatibility-rules/${RULE_ID}`)
      .set('Authorization', 'Bearer admin-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body.message).toMatch(/desactivad/i);
      });

    expect(compatibilityServiceMock.deactivate).toHaveBeenCalledWith(RULE_ID);
  });

  it('POST /api/v1/commercial/compatibility/validate valida combinación de ítems', async () => {
    compatibilityServiceMock.validateCombination.mockResolvedValue({
      valid: true,
      errors: [],
      warnings: [],
    });

    await request(app.getHttpServer())
      .post('/api/v1/commercial/compatibility/validate')
      .set('Authorization', 'Bearer sales-token')
      .send({ itemIds: [ITEM_ID_A, ITEM_ID_B] })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data.valid).toBe(true);
        expect(body.data.errors).toHaveLength(0);
      });

    expect(compatibilityServiceMock.validateCombination).toHaveBeenCalledWith([
      ITEM_ID_A,
      ITEM_ID_B,
    ]);
  });

  it('POST /api/v1/commercial/compatibility/validate retorna resultado con errores de regla EXCLUDES', async () => {
    compatibilityServiceMock.validateCombination.mockResolvedValue({
      valid: false,
      errors: [`Los ítems ${ITEM_ID_A} y ${ITEM_ID_B} son incompatibles`],
      warnings: [],
    });

    await request(app.getHttpServer())
      .post('/api/v1/commercial/compatibility/validate')
      .set('Authorization', 'Bearer sales-token')
      .send({ itemIds: [ITEM_ID_A, ITEM_ID_B] })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data.valid).toBe(false);
        expect(body.data.errors).toHaveLength(1);
      });
  });

  it('PATCH /api/v1/commercial/compatibility-rules/:id actualiza regla', async () => {
    const RULE_ID = '55555555-5555-4555-8555-555555555555';
    compatibilityServiceMock.update.mockResolvedValue({
      id: RULE_ID,
      note: 'Migrado por cambio de velocidades',
      isActive: true,
    });

    await request(app.getHttpServer())
      .patch(`/api/v1/commercial/compatibility-rules/${RULE_ID}`)
      .set('Authorization', 'Bearer admin-token')
      .send({ note: 'Migrado por cambio de velocidades' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.note).toBe('Migrado por cambio de velocidades');
      });

    expect(compatibilityServiceMock.update).toHaveBeenCalledWith(
      RULE_ID,
      expect.objectContaining({ note: 'Migrado por cambio de velocidades' }),
    );
  });

  it('PATCH /api/v1/commercial/compatibility-rules/:id retorna 403 con rol SALES', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/commercial/compatibility-rules/55555555-5555-4555-8555-555555555555`)
      .set('Authorization', 'Bearer sales-token')
      .send({ note: 'intento sin permisos' })
      .expect(403);
  });
});
