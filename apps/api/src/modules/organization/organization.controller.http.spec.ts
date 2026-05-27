import {
  ForbiddenException,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import {
  AccessPermissionKey,
  OrganizationSiteCapability,
  OrganizationSiteType,
  UserRole,
} from '@iwana/shared';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { EffectivePermissionsService } from '../access-control/services/effective-permissions.service';
import { PermissionsGuard } from '../access-control/guards/permissions.guard';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';

jest.mock('../auth/guards/jwt-auth.guard', () => ({
  JwtAuthGuard: class JwtAuthGuard {
    canActivate(context: {
      getHandler: () => unknown;
      getClass: () => unknown;
      switchToHttp: () => {
        getRequest: () => { headers: Record<string, string | undefined>; user?: JwtPayload };
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

      if (authHeader === 'Bearer support-token') {
        request.user = {
          sub: 'usr-support',
          email: 'hash-support',
          role: UserRole.SUPPORT,
          tenantId: 'tenant-test',
          schemaName: 'tenant_test',
          jti: 'jti-support',
          type: 'tenant',
        };
        return true;
      }

      if (authHeader === 'Bearer admin-readonly-token') {
        request.user = {
          sub: 'usr-admin-readonly',
          email: 'hash-admin-readonly',
          role: UserRole.ADMIN,
          tenantId: 'tenant-test',
          schemaName: 'tenant_test',
          jti: 'jti-admin-readonly',
          type: 'tenant',
        };
        return true;
      }

      if (authHeader === 'Bearer admin-site-scoped-token') {
        request.user = {
          sub: 'usr-admin-site-scoped',
          email: 'hash-admin-site-scoped',
          role: UserRole.ADMIN,
          tenantId: 'tenant-test',
          schemaName: 'tenant_test',
          jti: 'jti-admin-site-scoped',
          type: 'tenant',
        };
        return true;
      }

      if (authHeader !== 'Bearer admin-token') {
        throw new UnauthorizedException('Token de acceso invalido o expirado.');
      }

      request.user = {
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

describe('OrganizationController HTTP', () => {
  let app: INestApplication;

  const organizationServiceMock = {
    findAll: jest.fn(),
    create: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    replaceBusinessHours: jest.fn(),
    replaceAssignments: jest.fn(),
    replaceResponsibilities: jest.fn(),
  };
  const effectivePermissionsServiceMock = {
    getEffectivePermissionsForUser: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [OrganizationController],
      providers: [
        { provide: OrganizationService, useValue: organizationServiceMock },
        { provide: EffectivePermissionsService, useValue: effectivePermissionsServiceMock },
        JwtAuthGuard,
        RolesGuard,
        PermissionsGuard,
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
    effectivePermissionsServiceMock.getEffectivePermissionsForUser.mockImplementation(
      async (userId: string, siteId?: string) => {
        if (userId === 'usr-support') {
          return [AccessPermissionKey.ORGANIZATION_SITES_READ];
        }

        if (userId === 'usr-admin-readonly') {
          return [AccessPermissionKey.SETTINGS_READ];
        }

        if (userId === 'usr-admin-site-scoped') {
          return siteId === '243f5a18-4adc-4ca5-8cce-f55b70a3412e'
            ? [AccessPermissionKey.ORGANIZATION_SITES_READ]
            : [];
        }

        return [
          AccessPermissionKey.ORGANIZATION_SITES_READ,
          AccessPermissionKey.ORGANIZATION_SITES_MANAGE,
          AccessPermissionKey.ORGANIZATION_HOURS_MANAGE,
          AccessPermissionKey.ORGANIZATION_ASSIGNMENTS_MANAGE,
        ];
      },
    );
  });

  it('GET /api/v1/organization/sites retorna 200 para rol allowed', async () => {
    organizationServiceMock.findAll.mockResolvedValue([]);

    await request(app.getHttpServer())
      .get('/api/v1/organization/sites')
      .set('Authorization', 'Bearer support-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toEqual([]);
      });
  });

  it('GET /api/v1/organization/sites expone el summary enriquecido en el contrato HTTP', async () => {
    organizationServiceMock.findAll.mockResolvedValue([
      {
        id: '243f5a18-4adc-4ca5-8cce-f55b70a3412e',
        name: 'Sede centro',
        code: 'CENTRO',
        siteType: OrganizationSiteType.OFFICE,
        address: 'Cra 10 # 10-10',
        municipality: 'Bogotá',
        department: 'Cundinamarca',
        capabilities: [OrganizationSiteCapability.ADMIN_OFFICE],
        isActive: true,
      },
    ]);

    await request(app.getHttpServer())
      .get('/api/v1/organization/sites')
      .set('Authorization', 'Bearer support-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toEqual([
          expect.objectContaining({
            id: '243f5a18-4adc-4ca5-8cce-f55b70a3412e',
            name: 'Sede centro',
            code: 'CENTRO',
            siteType: OrganizationSiteType.OFFICE,
            address: 'Cra 10 # 10-10',
            municipality: 'Bogotá',
            department: 'Cundinamarca',
            capabilities: [OrganizationSiteCapability.ADMIN_OFFICE],
            isActive: true,
          }),
        ]);
      });
  });

  it('GET /api/v1/organization/sites retorna 401 sin JWT', async () => {
    await request(app.getHttpServer()).get('/api/v1/organization/sites').expect(401);
  });

  it('POST /api/v1/organization/sites crea sede con payload válido', async () => {
    organizationServiceMock.create.mockResolvedValue({ id: 'site-1' });

    await request(app.getHttpServer())
      .post('/api/v1/organization/sites')
      .set('Authorization', 'Bearer admin-token')
      .send({
        name: 'Sede norte',
        code: 'NORTE',
        siteType: OrganizationSiteType.OFFICE,
        latitude: 4.6486259,
        longitude: -74.0651466,
        contactName: 'Mesa tecnica centro',
        contactPhone: '+573001112233',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data.id).toBe('site-1');
      });
  });

  it('POST /api/v1/organization/sites acepta capabilities opcional', async () => {
    organizationServiceMock.create.mockResolvedValue({
      id: 'site-1',
      capabilities: [OrganizationSiteCapability.NOC],
    });

    await request(app.getHttpServer())
      .post('/api/v1/organization/sites')
      .set('Authorization', 'Bearer admin-token')
      .send({
        name: 'Sede norte',
        code: 'NORTE',
        siteType: OrganizationSiteType.OFFICE,
        latitude: 4.6486259,
        longitude: -74.0651466,
        contactName: 'Mesa tecnica centro',
        contactPhone: '+573001112233',
        capabilities: [OrganizationSiteCapability.NOC],
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data.capabilities).toEqual([OrganizationSiteCapability.NOC]);
        expect(organizationServiceMock.create).toHaveBeenCalledWith(
          expect.objectContaining({
            capabilities: [OrganizationSiteCapability.NOC],
          }),
          expect.any(Object),
        );
      });
  });

  it('POST /api/v1/organization/sites retorna 403 para ADMIN sin permiso granular', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/organization/sites')
      .set('Authorization', 'Bearer admin-readonly-token')
      .send({ name: 'Sede norte', code: 'NORTE', siteType: OrganizationSiteType.OFFICE })
      .expect(403);
  });

  it('POST /api/v1/organization/sites valida siteType inválido', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/organization/sites')
      .set('Authorization', 'Bearer admin-token')
      .send({ name: 'Sede norte', code: 'NORTE', siteType: 'INVALID' })
      .expect(400);
  });

  it('GET /api/v1/organization/sites/:id retorna 403 cuando el perfil scoped no cubre la sede solicitada', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/organization/sites/6fda9b27-8c1a-4a5f-b82b-44d7f7ff14d9')
      .set('Authorization', 'Bearer admin-site-scoped-token')
      .expect(403);
  });

  it('GET /api/v1/organization/sites/:id retorna 200 cuando el perfil scoped cubre la sede solicitada', async () => {
    organizationServiceMock.findOne.mockResolvedValue({
      id: '243f5a18-4adc-4ca5-8cce-f55b70a3412e',
    });

    await request(app.getHttpServer())
      .get('/api/v1/organization/sites/243f5a18-4adc-4ca5-8cce-f55b70a3412e')
      .set('Authorization', 'Bearer admin-site-scoped-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.id).toBe('243f5a18-4adc-4ca5-8cce-f55b70a3412e');
      });
  });

  it('PATCH /api/v1/organization/sites/:id acepta capabilities vacío', async () => {
    organizationServiceMock.update.mockResolvedValue({
      id: '243f5a18-4adc-4ca5-8cce-f55b70a3412e',
      capabilities: [],
    });

    await request(app.getHttpServer())
      .patch('/api/v1/organization/sites/243f5a18-4adc-4ca5-8cce-f55b70a3412e')
      .set('Authorization', 'Bearer admin-token')
      .send({ capabilities: [] })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.capabilities).toEqual([]);
        expect(organizationServiceMock.update).toHaveBeenCalledWith(
          '243f5a18-4adc-4ca5-8cce-f55b70a3412e',
          expect.objectContaining({ capabilities: [] }),
          expect.any(Object),
        );
      });
  });

  it('PATCH /api/v1/organization/sites/:id conserva capacidades si capabilities no se envía', async () => {
    organizationServiceMock.update.mockResolvedValue({
      id: '243f5a18-4adc-4ca5-8cce-f55b70a3412e',
      name: 'Sede centro actualizada',
      capabilities: [OrganizationSiteCapability.NOC],
    });

    await request(app.getHttpServer())
      .patch('/api/v1/organization/sites/243f5a18-4adc-4ca5-8cce-f55b70a3412e')
      .set('Authorization', 'Bearer admin-token')
      .send({ name: 'Sede centro actualizada' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.capabilities).toEqual([OrganizationSiteCapability.NOC]);
        expect(organizationServiceMock.update).toHaveBeenCalledWith(
          '243f5a18-4adc-4ca5-8cce-f55b70a3412e',
          expect.not.objectContaining({ capabilities: expect.anything() }),
          expect.any(Object),
        );
      });
  });

  it('DELETE /api/v1/organization/sites/:id aplica baja lógica y el listado posterior ya no expone la sede', async () => {
    organizationServiceMock.findAll
      .mockResolvedValueOnce([{ id: '243f5a18-4adc-4ca5-8cce-f55b70a3412e', name: 'Sede centro' }])
      .mockResolvedValueOnce([]);

    await request(app.getHttpServer())
      .get('/api/v1/organization/sites')
      .set('Authorization', 'Bearer admin-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toHaveLength(1);
      });

    await request(app.getHttpServer())
      .delete('/api/v1/organization/sites/243f5a18-4adc-4ca5-8cce-f55b70a3412e')
      .set('Authorization', 'Bearer admin-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body.message).toBe('Sede eliminada');
      });

    await request(app.getHttpServer())
      .get('/api/v1/organization/sites')
      .set('Authorization', 'Bearer admin-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toEqual([]);
      });
  });

  it('POST /api/v1/organization/sites acepta coordenadas y contacto requeridos', async () => {
    organizationServiceMock.create.mockResolvedValue({ id: 'site-1' });

    await request(app.getHttpServer())
      .post('/api/v1/organization/sites')
      .set('Authorization', 'Bearer admin-token')
      .send({
        name: 'Sede norte',
        code: 'NORTE',
        siteType: OrganizationSiteType.OFFICE,
        latitude: 4.6486259,
        longitude: -74.0651466,
        contactName: 'Mesa tecnica centro',
        contactPhone: '+573001112233',
      })
      .expect(201);
  });

  it('POST /api/v1/organization/sites retorna 400 cuando falta contactPhone', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/organization/sites')
      .set('Authorization', 'Bearer admin-token')
      .send({
        name: 'Sede norte',
        code: 'NORTE',
        siteType: OrganizationSiteType.OFFICE,
        latitude: 4.6486259,
        longitude: -74.0651466,
        contactName: 'Mesa tecnica centro',
      })
      .expect(400);
  });

  it('POST /api/v1/organization/sites retorna 400 cuando falta contactName', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/organization/sites')
      .set('Authorization', 'Bearer admin-token')
      .send({
        name: 'Sede norte',
        code: 'NORTE',
        siteType: OrganizationSiteType.OFFICE,
        latitude: 4.6486259,
        longitude: -74.0651466,
        contactPhone: '+573001112233',
      })
      .expect(400);
  });
});
