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
import { TaxController } from './controllers/tax.controller';
import { TaxApplicationService } from './services/tax-application.service';

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

      if (authHeader !== 'Bearer accountant-token') {
        throw new UnauthorizedException('Token de acceso invalido o expirado.');
      }

      request.user = {
        id: 'legacy-accountant-id',
        sub: 'usr-accountant-sub',
        email: 'hash-accountant',
        role: UserRole.ACCOUNTANT,
        tenantId: 'tenant-test',
        schemaName: 'tenant_test',
        jti: 'jti-accountant',
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

describe('TaxController HTTP', () => {
  let app: INestApplication;

  const taxApplicationServiceMock = {
    resolve: jest.fn(),
    simulate: jest.fn(),
    listApplications: jest.fn(),
    createApplication: jest.fn(),
    updateApplication: jest.fn(),
    deleteApplication: jest.fn(),
    listRules: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [TaxController],
      providers: [
        { provide: TaxApplicationService, useValue: taxApplicationServiceMock },
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

  // ─── GET /commercial/tax-rules ────────────────────────────────────────────

  it('GET /api/v1/commercial/tax-rules retorna 200 con lista de reglas', async () => {
    taxApplicationServiceMock.listRules.mockResolvedValue([]);

    await request(app.getHttpServer())
      .get('/api/v1/commercial/tax-rules')
      .set('Authorization', 'Bearer accountant-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toEqual([]);
      });

    expect(taxApplicationServiceMock.listRules).toHaveBeenCalled();
  });

  it('GET /api/v1/commercial/tax-rules retorna 403 con rol no permitido', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/commercial/tax-rules')
      .set('Authorization', 'Bearer sales-token')
      .expect(403);
  });

  // ─── POST /commercial/tax/simulate ──────────────────────────────────────

  it('POST /api/v1/commercial/tax/simulate retorna 201 con resultado de simulación', async () => {
    const simulateResult = {
      applications: [
        {
          taxDefinitionId: 'td-iva-exento',
          treatment: 'EXEMPT',
          effectiveRate: null,
          ruleId: 'rule-residential-id',
          priorityMatched: 10,
        },
      ],
      winnerRuleId: 'rule-residential-id',
      reason:
        'Regla de prioridad 10 aplicada: segmento RESIDENTIAL, estrato 2. 1 impuesto(s) aplicable(s).',
    };

    taxApplicationServiceMock.simulate.mockResolvedValue(simulateResult);

    await request(app.getHttpServer())
      .post('/api/v1/commercial/tax/simulate')
      .set('Authorization', 'Bearer accountant-token')
      .send({ segment: 'RESIDENTIAL', stratum: 2 })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data.winnerRuleId).toBe('rule-residential-id');
        expect(body.data.applications).toHaveLength(1);
        expect(body.data.applications[0].treatment).toBe('EXEMPT');
        expect(body.data.reason).toContain('prioridad 10');
      });

    expect(taxApplicationServiceMock.simulate).toHaveBeenCalledWith('RESIDENTIAL', 2, undefined);
  });

  it('POST /api/v1/commercial/tax/simulate acepta municipalityCode', async () => {
    taxApplicationServiceMock.simulate.mockResolvedValue({
      applications: [],
      winnerRuleId: null,
      reason: 'No se encontró regla tributaria.',
    });

    await request(app.getHttpServer())
      .post('/api/v1/commercial/tax/simulate')
      .set('Authorization', 'Bearer accountant-token')
      .send({ segment: 'GOVERNMENT', municipalityCode: '11001' })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data.winnerRuleId).toBeNull();
      });

    expect(taxApplicationServiceMock.simulate).toHaveBeenCalledWith(
      'GOVERNMENT',
      undefined,
      '11001',
    );
  });

  it('POST /api/v1/commercial/tax/simulate retorna 400 con segmento inválido', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/commercial/tax/simulate')
      .set('Authorization', 'Bearer accountant-token')
      .send({ segment: 'NO_EXISTE' })
      .expect(400);
  });

  it('POST /api/v1/commercial/tax/simulate retorna 201 con rol SALES', async () => {
    taxApplicationServiceMock.simulate.mockResolvedValue({
      applications: [],
      winnerRuleId: null,
      reason: 'No se encontró regla tributaria.',
    });

    await request(app.getHttpServer())
      .post('/api/v1/commercial/tax/simulate')
      .set('Authorization', 'Bearer sales-token')
      .send({ segment: 'RESIDENTIAL' })
      .expect(201);
  });
});
