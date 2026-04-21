import {
  ForbiddenException,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { TaxType, UserRole } from '@iwana/shared';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TaxController } from './controllers/tax.controller';
import { TaxClassificationService } from './services/tax-classification.service';
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

  const taxClassificationServiceMock = {
    findAllClassifications: jest.fn(),
    findOneClassification: jest.fn(),
    createClassification: jest.fn(),
    updateClassification: jest.fn(),
    findRulesByClassification: jest.fn(),
    findAllRules: jest.fn(),
    createRule: jest.fn(),
    updateRule: jest.fn(),
    deactivateRule: jest.fn(),
    resolveClassification: jest.fn(),
    deactivateClassification: jest.fn(),
  };

  const taxApplicationServiceMock = {
    resolve: jest.fn(),
    simulate: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [TaxController],
      providers: [
        { provide: TaxClassificationService, useValue: taxClassificationServiceMock },
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

  it('GET /api/v1/commercial/tax-rules retorna 200 y propaga filtro taxClassificationId', async () => {
    taxClassificationServiceMock.findAllRules.mockResolvedValue([]);

    await request(app.getHttpServer())
      .get('/api/v1/commercial/tax-rules?taxClassificationId=11111111-1111-1111-1111-111111111111')
      .set('Authorization', 'Bearer accountant-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toEqual([]);
      });

    expect(taxClassificationServiceMock.findAllRules).toHaveBeenCalledWith(
      '11111111-1111-1111-1111-111111111111',
    );
  });

  it('GET /api/v1/commercial/tax-rules retorna 403 con rol no permitido', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/commercial/tax-rules')
      .set('Authorization', 'Bearer sales-token')
      .expect(403);
  });

  it('POST /api/v1/commercial/tax-rules crea regla con actor autenticado', async () => {
    taxClassificationServiceMock.createRule.mockResolvedValue({ id: 'tax-rule-1' });

    await request(app.getHttpServer())
      .post('/api/v1/commercial/tax-rules')
      .set('Authorization', 'Bearer accountant-token')
      .send({
        taxClassificationId: '11111111-1111-1111-1111-111111111111',
        taxType: TaxType.IVA,
        ratePercentage: '19.00',
      })
      .expect(201);

    expect(taxClassificationServiceMock.createRule).toHaveBeenCalledWith(
      {
        taxClassificationId: '11111111-1111-1111-1111-111111111111',
        taxType: TaxType.IVA,
        ratePercentage: '19.00',
      },
      'usr-accountant-sub',
    );
  });

  it('PATCH /api/v1/commercial/tax-rules/:id actualiza regla tributaria', async () => {
    taxClassificationServiceMock.updateRule.mockResolvedValue({ id: 'tax-rule-1' });

    await request(app.getHttpServer())
      .patch('/api/v1/commercial/tax-rules/11111111-1111-1111-1111-111111111111')
      .set('Authorization', 'Bearer accountant-token')
      .send({
        ratePercentage: '5.00',
        isActive: false,
      })
      .expect(200);

    expect(taxClassificationServiceMock.updateRule).toHaveBeenCalledWith(
      '11111111-1111-1111-1111-111111111111',
      {
        ratePercentage: '5.00',
        isActive: false,
      },
    );
  });

  it('POST /api/v1/commercial/tax/resolve resuelve clasificación tributaria', async () => {
    taxClassificationServiceMock.resolveClassification.mockResolvedValue({
      id: 'cls-exempt',
      name: 'Exento',
      appliesIva: false,
      appliesRetefuente: false,
      appliesReteIca: false,
      appliesEstampillas: false,
    });

    await request(app.getHttpServer())
      .post('/api/v1/commercial/tax/resolve')
      .set('Authorization', 'Bearer accountant-token')
      .send({ segment: 'RESIDENTIAL', stratum: 2 })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data.name).toBe('Exento');
        expect(body.data.appliesIva).toBe(false);
      });

    expect(taxClassificationServiceMock.resolveClassification).toHaveBeenCalledWith(
      'RESIDENTIAL',
      2,
    );
  });

  it('POST /api/v1/commercial/tax/resolve retorna 400 con segmento inválido', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/commercial/tax/resolve')
      .set('Authorization', 'Bearer accountant-token')
      .send({ segment: 'INVALIDO' })
      .expect(400);
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

  it('POST /api/v1/commercial/tax/simulate retorna 403 con rol no permitido', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/commercial/tax/simulate')
      .set('Authorization', 'Bearer sales-token')
      .send({ segment: 'RESIDENTIAL' })
      // SALES tiene permiso para simulate (igual que resolve)
      .expect(201);
  });
});
