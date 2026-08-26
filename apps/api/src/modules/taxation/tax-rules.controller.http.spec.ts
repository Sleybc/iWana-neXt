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
import { TaxRulesController } from './tax-rules.controller';
import { CommercialTaxAliasController } from './commercial-tax-alias.controller';
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

describe('TaxRulesController HTTP', () => {
  let app: INestApplication;

  const taxApplicationServiceMock = {
    resolve: jest.fn(),
    simulate: jest.fn(),
    hasActiveCoverage: jest.fn(),
    listApplications: jest.fn(),
    createApplication: jest.fn(),
    updateApplication: jest.fn(),
    deleteApplication: jest.fn(),
    listRules: jest.fn(),
    createRule: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [TaxRulesController, CommercialTaxAliasController],
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

  it('GET /api/v1/taxation/tax-rules retorna 200', async () => {
    taxApplicationServiceMock.listRules.mockResolvedValue({
      data: [],
      meta: { nextCursor: null, total: 0 },
    });

    await request(app.getHttpServer())
      .get('/api/v1/taxation/tax-rules')
      .set('Authorization', 'Bearer accountant-token')
      .expect(200);

    expect(taxApplicationServiceMock.listRules).toHaveBeenCalled();
  });

  it('GET /api/v1/commercial/tax-rules alias deprecado sigue vivo', async () => {
    taxApplicationServiceMock.listRules.mockResolvedValue({
      data: [],
      meta: { nextCursor: null, total: 0 },
    });

    await request(app.getHttpServer())
      .get('/api/v1/commercial/tax-rules')
      .set('Authorization', 'Bearer accountant-token')
      .expect(200);
  });

  it('POST /api/v1/taxation/tax/simulate exige personType', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/taxation/tax/simulate')
      .set('Authorization', 'Bearer accountant-token')
      .send({ segment: 'RESIDENTIAL', stratum: 2 })
      .expect(400);
  });

  it('POST /api/v1/taxation/tax/simulate retorna 201', async () => {
    taxApplicationServiceMock.simulate.mockResolvedValue({
      applications: [],
      winnerRuleId: null,
      reason: 'No se encontró regla tributaria activa para el perfil simulado.',
    });

    await request(app.getHttpServer())
      .post('/api/v1/taxation/tax/simulate')
      .set('Authorization', 'Bearer accountant-token')
      .send({ personType: 'NATURAL', segment: 'RESIDENTIAL', stratum: 2 })
      .expect(201);

    expect(taxApplicationServiceMock.simulate).toHaveBeenCalledWith(
      expect.objectContaining({
        personType: 'NATURAL',
        segment: 'RESIDENTIAL',
        stratum: 2,
      }),
    );
  });

  it('POST simulate acepta rol SALES', async () => {
    taxApplicationServiceMock.simulate.mockResolvedValue({
      applications: [],
      winnerRuleId: null,
      reason: 'sin regla',
    });

    await request(app.getHttpServer())
      .post('/api/v1/taxation/tax/simulate')
      .set('Authorization', 'Bearer sales-token')
      .send({ personType: 'JURIDICA', segment: 'CORPORATE' })
      .expect(201);
  });

  it('GET /api/v1/taxation/tax-rules retorna 403 con SALES', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/taxation/tax-rules')
      .set('Authorization', 'Bearer sales-token')
      .expect(403);
  });
});
