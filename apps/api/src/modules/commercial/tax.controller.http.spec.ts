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
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [TaxController],
      providers: [
        { provide: TaxClassificationService, useValue: taxClassificationServiceMock },
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
});
