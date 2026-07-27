import {
  BadRequestException,
  ForbiddenException,
  INestApplication,
  NotFoundException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import {
  TaxCategory,
  JurisdictionLevel,
  TaxTreatment,
  TaxContext,
  TaxOrigin,
  UserRole,
} from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { TaxationController } from '../taxation.controller';
import { TaxDefinitionService } from '../services/tax-definition.service';

jest.mock('../../auth/guards/jwt-auth.guard', () => ({
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

      if (authHeader === 'Bearer accountant-token') {
        request.user = {
          id: 'user-accountant-id',
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

      if (authHeader === 'Bearer admin-token') {
        request.user = {
          id: 'user-admin-id',
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

      if (authHeader === 'Bearer sales-token') {
        request.user = {
          id: 'user-sales-id',
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

      throw new UnauthorizedException('Token de acceso invalido o expirado.');
    }
  },
}));

jest.mock('../../auth/guards/roles.guard', () => ({
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

describe('TaxationController HTTP', () => {
  let app: INestApplication;

  const taxDefinitionServiceMock = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
  };

  const validTaxDefId = '11111111-1111-1111-1111-111111111111';
  const notFoundId = '99999999-9999-9999-9999-999999999999';
  const systemPresetId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  const validTaxDef = {
    id: validTaxDefId,
    code: 'IVA_19',
    name: 'IVA 19%',
    category: TaxCategory.VAT,
    jurisdictionLevel: JurisdictionLevel.NATIONAL,
    municipalityCode: null,
    baseRate: '19.0000',
    treatment: TaxTreatment.STANDARD,
    context: TaxContext.BOTH,
    origin: TaxOrigin.CUSTOM,
    isActive: true,
    notes: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    deletedAt: null,
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [TaxationController],
      providers: [
        { provide: TaxDefinitionService, useValue: taxDefinitionServiceMock },
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

  describe('GET /api/v1/taxation/definitions', () => {
    it('retorna 200 con array vacío cuando no hay definiciones', async () => {
      taxDefinitionServiceMock.findAll.mockResolvedValue({
        data: [],
        meta: { nextCursor: null, total: 0 },
      });

      await request(app.getHttpServer())
        .get('/api/v1/taxation/definitions')
        .set('Authorization', 'Bearer accountant-token')
        .expect(200)
        .expect(({ body }) => {
          expect(body.data).toEqual([]);
          expect(body.meta).toEqual({ nextCursor: null, total: 0 });
        });

      expect(taxDefinitionServiceMock.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 20 }),
      );
    });

    it('retorna 200 con array de definiciones', async () => {
      taxDefinitionServiceMock.findAll.mockResolvedValue({
        data: [validTaxDef],
        meta: { nextCursor: null, total: 1 },
      });

      await request(app.getHttpServer())
        .get('/api/v1/taxation/definitions')
        .set('Authorization', 'Bearer accountant-token')
        .expect(200)
        .expect(({ body }) => {
          expect(body.data).toHaveLength(1);
          expect(body.data[0].code).toBe('IVA_19');
          expect(body.meta.total).toBe(1);
        });
    });

    it('propaga query params category y context al servicio', async () => {
      taxDefinitionServiceMock.findAll.mockResolvedValue({
        data: [],
        meta: { nextCursor: null, total: 0 },
      });

      await request(app.getHttpServer())
        .get('/api/v1/taxation/definitions?category=VAT&context=SALES')
        .set('Authorization', 'Bearer accountant-token')
        .expect(200);

      expect(taxDefinitionServiceMock.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'VAT',
          context: 'SALES',
          limit: 20,
        }),
      );
    });

    it('retorna 403 con rol no permitido', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/taxation/definitions')
        .set('Authorization', 'Bearer sales-token')
        .expect(403);
    });
  });

  describe('GET /api/v1/taxation/definitions/:id', () => {
    it('retorna 200 con definición encontrada', async () => {
      taxDefinitionServiceMock.findOne.mockResolvedValue(validTaxDef);

      await request(app.getHttpServer())
        .get(`/api/v1/taxation/definitions/${validTaxDefId}`)
        .set('Authorization', 'Bearer accountant-token')
        .expect(200)
        .expect(({ body }) => {
          expect(body.data.id).toBe(validTaxDefId);
          expect(body.data.code).toBe('IVA_19');
        });

      expect(taxDefinitionServiceMock.findOne).toHaveBeenCalledWith(validTaxDefId);
    });

    it('retorna 404 cuando el servicio lanza NotFoundException', async () => {
      taxDefinitionServiceMock.findOne.mockRejectedValue(
        new NotFoundException(`TaxDefinition ${notFoundId} no encontrada`),
      );

      await request(app.getHttpServer())
        .get(`/api/v1/taxation/definitions/${notFoundId}`)
        .set('Authorization', 'Bearer accountant-token')
        .expect(404);
    });

    it('retorna 400 para ID con formato UUID inválido', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/taxation/definitions/invalid-uuid')
        .set('Authorization', 'Bearer accountant-token')
        .expect(400);
    });
  });

  describe('POST /api/v1/taxation/definitions', () => {
    const validCreatePayload = {
      code: 'IVA_19',
      name: 'IVA 19%',
      category: TaxCategory.VAT,
      jurisdictionLevel: JurisdictionLevel.NATIONAL,
      treatment: TaxTreatment.STANDARD,
      context: TaxContext.BOTH,
    };

    it('retorna 201 con definición creada', async () => {
      taxDefinitionServiceMock.create.mockResolvedValue(validTaxDef);

      await request(app.getHttpServer())
        .post('/api/v1/taxation/definitions')
        .set('Authorization', 'Bearer accountant-token')
        .send(validCreatePayload)
        .expect(201)
        .expect(({ body }) => {
          expect(body.data.id).toBe(validTaxDefId);
          expect(body.data.code).toBe('IVA_19');
        });

      expect(taxDefinitionServiceMock.create).toHaveBeenCalledWith(validCreatePayload);
    });

    it('retorna 400 cuando el servicio lanza BadRequestException por código duplicado', async () => {
      taxDefinitionServiceMock.create.mockRejectedValue(
        new BadRequestException("Ya existe una definición con código 'IVA_19'"),
      );

      await request(app.getHttpServer())
        .post('/api/v1/taxation/definitions')
        .set('Authorization', 'Bearer accountant-token')
        .send(validCreatePayload)
        .expect(400);
    });

    it('retorna 400 cuando faltan campos obligatorios', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/taxation/definitions')
        .set('Authorization', 'Bearer accountant-token')
        .send({
          code: 'IVA_19',
          // faltan: name, category, jurisdictionLevel, treatment, context
        })
        .expect(400);
    });

    it('retorna 400 cuando category tiene valor inválido', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/taxation/definitions')
        .set('Authorization', 'Bearer accountant-token')
        .send({
          ...validCreatePayload,
          category: 'INVALID_CATEGORY',
        })
        .expect(400);
    });
  });

  describe('PATCH /api/v1/taxation/definitions/:id', () => {
    const validUpdatePayload = {
      name: 'IVA 19% actualizado',
      baseRate: '19.50',
    };

    it('retorna 200 con definición actualizada', async () => {
      const updated = { ...validTaxDef, name: 'IVA 19% actualizado', baseRate: '19.5000' };
      taxDefinitionServiceMock.update.mockResolvedValue(updated);

      await request(app.getHttpServer())
        .patch(`/api/v1/taxation/definitions/${validTaxDefId}`)
        .set('Authorization', 'Bearer accountant-token')
        .send(validUpdatePayload)
        .expect(200)
        .expect(({ body }) => {
          expect(body.data.name).toBe('IVA 19% actualizado');
          expect(body.data.baseRate).toBe('19.5000');
        });

      expect(taxDefinitionServiceMock.update).toHaveBeenCalledWith(
        validTaxDefId,
        validUpdatePayload,
      );
    });

    it('retorna 200 cuando actualiza un preset SYSTEM', async () => {
      const updated = { ...validTaxDef, id: systemPresetId, name: 'IVA 19% plantilla' };
      taxDefinitionServiceMock.update.mockResolvedValue(updated);

      await request(app.getHttpServer())
        .patch(`/api/v1/taxation/definitions/${systemPresetId}`)
        .set('Authorization', 'Bearer accountant-token')
        .send(validUpdatePayload)
        .expect(200)
        .expect(({ body }) => {
          expect(body.data.id).toBe(systemPresetId);
          expect(body.data.name).toBe('IVA 19% plantilla');
        });
    });

    it('retorna 404 cuando el servicio lanza NotFoundException', async () => {
      taxDefinitionServiceMock.update.mockRejectedValue(
        new NotFoundException(`TaxDefinition ${notFoundId} no encontrada`),
      );

      await request(app.getHttpServer())
        .patch(`/api/v1/taxation/definitions/${notFoundId}`)
        .set('Authorization', 'Bearer accountant-token')
        .send(validUpdatePayload)
        .expect(404);
    });

    it('retorna 400 para ID con formato UUID inválido', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/taxation/definitions/invalid-uuid')
        .set('Authorization', 'Bearer accountant-token')
        .send(validUpdatePayload)
        .expect(400);
    });
  });

  describe('DELETE /api/v1/taxation/definitions/:id', () => {
    it('retorna 200 con mensaje de éxito al desactivar definición', async () => {
      taxDefinitionServiceMock.softDelete.mockResolvedValue(undefined);

      await request(app.getHttpServer())
        .delete(`/api/v1/taxation/definitions/${validTaxDefId}`)
        .set('Authorization', 'Bearer admin-token')
        .expect(200)
        .expect(({ body }) => {
          expect(body.message).toBe('Definición de impuesto desactivada');
        });

      expect(taxDefinitionServiceMock.softDelete).toHaveBeenCalledWith(validTaxDefId);
    });

    it('retorna 200 cuando desactiva un preset SYSTEM', async () => {
      taxDefinitionServiceMock.softDelete.mockResolvedValue(undefined);

      await request(app.getHttpServer())
        .delete(`/api/v1/taxation/definitions/${systemPresetId}`)
        .set('Authorization', 'Bearer admin-token')
        .expect(200);

      expect(taxDefinitionServiceMock.softDelete).toHaveBeenCalledWith(systemPresetId);
    });

    it('retorna 404 cuando el servicio lanza NotFoundException', async () => {
      taxDefinitionServiceMock.softDelete.mockRejectedValue(
        new NotFoundException(`TaxDefinition ${notFoundId} no encontrada`),
      );

      await request(app.getHttpServer())
        .delete(`/api/v1/taxation/definitions/${notFoundId}`)
        .set('Authorization', 'Bearer admin-token')
        .expect(404);
    });

    it('retorna 403 con rol ACCOUNTANT no permitido para DELETE', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/taxation/definitions/${validTaxDefId}`)
        .set('Authorization', 'Bearer accountant-token')
        .expect(403);
    });
  });
});
