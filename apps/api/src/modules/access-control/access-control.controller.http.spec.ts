import {
  ForbiddenException,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AccessPermissionKey, UserRole } from '@iwana/shared';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AccessControlController } from './access-control.controller';
import { AccessControlService } from './access-control.service';
import { PermissionsGuard } from './guards/permissions.guard';
import { EffectivePermissionsService } from './services/effective-permissions.service';

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

      if (authHeader === 'Bearer admin-profiles-only-token') {
        request.user = {
          sub: 'usr-admin-profiles-only',
          email: 'hash-admin-profiles-only',
          role: UserRole.ADMIN,
          tenantId: 'tenant-test',
          schemaName: 'tenant_test',
          jti: 'jti-admin-profiles-only',
          type: 'tenant',
        };
        return true;
      }

      if (authHeader === 'Bearer admin-assignments-only-token') {
        request.user = {
          sub: 'usr-admin-assignments-only',
          email: 'hash-admin-assignments-only',
          role: UserRole.ADMIN,
          tenantId: 'tenant-test',
          schemaName: 'tenant_test',
          jti: 'jti-admin-assignments-only',
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

describe('AccessControlController HTTP', () => {
  let app: INestApplication;

  const accessControlServiceMock = {
    listPermissions: jest.fn(),
    listProfiles: jest.fn(),
    createProfile: jest.fn(),
    updateProfile: jest.fn(),
    removeProfile: jest.fn(),
    replaceProfilePermissions: jest.fn(),
    replaceUserProfiles: jest.fn(),
    getEffectivePermissionsSummary: jest.fn(),
  };
  const effectivePermissionsServiceMock = {
    getEffectivePermissionsForUser: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AccessControlController],
      providers: [
        { provide: AccessControlService, useValue: accessControlServiceMock },
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
      async (userId: string) => {
        if (userId === 'usr-admin-readonly') {
          return [AccessPermissionKey.SETTINGS_READ];
        }

        if (userId === 'usr-admin-profiles-only') {
          return [AccessPermissionKey.ACCESS_PROFILES_MANAGE];
        }

        if (userId === 'usr-admin-assignments-only') {
          return [AccessPermissionKey.ACCESS_ASSIGNMENTS_MANAGE];
        }

        return [
          AccessPermissionKey.ACCESS_PERMISSIONS_READ,
          AccessPermissionKey.ACCESS_PROFILES_READ,
          AccessPermissionKey.ACCESS_PROFILES_MANAGE,
          AccessPermissionKey.ACCESS_ASSIGNMENTS_MANAGE,
        ];
      },
    );
  });

  it('GET /api/v1/access-control/permissions retorna catálogo seeded', async () => {
    accessControlServiceMock.listPermissions.mockResolvedValue({
      version: 'MOD00_ACCESS_V2',
      permissions: [],
      compatibilityMatrix: {},
    });

    await request(app.getHttpServer())
      .get('/api/v1/access-control/permissions')
      .set('Authorization', 'Bearer admin-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.version).toBe('MOD00_ACCESS_V2');
      });
  });

  it('GET /api/v1/access-control/permissions retorna 403 para rol no permitido', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/access-control/permissions')
      .set('Authorization', 'Bearer support-token')
      .expect(403);
  });

  it('GET /api/v1/access-control/profiles retorna 403 para ADMIN sin permiso granular', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/access-control/profiles')
      .set('Authorization', 'Bearer admin-readonly-token')
      .expect(403);
  });

  it('GET /api/v1/access-control/profiles retorna plantillas iniciales del sistema', async () => {
    accessControlServiceMock.listProfiles.mockResolvedValue([
      {
        id: 'template-admin',
        name: 'Administrador general',
        description: 'Plantilla inicial para la administración general de la empresa.',
        baseRoleConstraint: UserRole.ADMIN,
        scopeSiteId: null,
        isSystem: true,
        isActive: true,
        permissions: [AccessPermissionKey.USERS_MANAGE],
        createdAt: new Date('2026-05-25T00:00:00.000Z'),
        updatedAt: new Date('2026-05-25T00:00:00.000Z'),
      },
    ]);

    await request(app.getHttpServer())
      .get('/api/v1/access-control/profiles')
      .set('Authorization', 'Bearer admin-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data[0].isSystem).toBe(true);
        expect(body.data[0].name).toBe('Administrador general');
      });
  });

  it('POST /api/v1/access-control/profiles crea perfil válido', async () => {
    accessControlServiceMock.createProfile.mockResolvedValue({ id: 'profile-1' });

    await request(app.getHttpServer())
      .post('/api/v1/access-control/profiles')
      .set('Authorization', 'Bearer admin-token')
      .send({
        name: 'Perfil NOC lectura',
        baseRoleConstraint: UserRole.NOC,
        permissionKeys: [AccessPermissionKey.SETTINGS_READ],
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data.id).toBe('profile-1');
      });
  });

  it('PATCH /api/v1/access-control/profiles/:id valida enum inválido', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/access-control/profiles/243f5a18-4adc-4ca5-8cce-f55b70a3412e')
      .set('Authorization', 'Bearer admin-token')
      .send({ baseRoleConstraint: 'INVALID_ROLE' })
      .expect(400);
  });

  it('PUT /api/v1/access-control/profiles/:id/permissions valida duplicados con Zod', async () => {
    await request(app.getHttpServer())
      .put('/api/v1/access-control/profiles/243f5a18-4adc-4ca5-8cce-f55b70a3412e/permissions')
      .set('Authorization', 'Bearer admin-token')
      .send({
        permissionKeys: [AccessPermissionKey.SETTINGS_READ, AccessPermissionKey.SETTINGS_READ],
      })
      .expect(400);
  });

  it('PUT /api/v1/access-control/users/:id/profiles retorna 403 sin permiso dedicado de asignacion', async () => {
    await request(app.getHttpServer())
      .put('/api/v1/access-control/users/243f5a18-4adc-4ca5-8cce-f55b70a3412e/profiles')
      .set('Authorization', 'Bearer admin-profiles-only-token')
      .send({ profileIds: ['243f5a18-4adc-4ca5-8cce-f55b70a3412e'] })
      .expect(403);
  });

  it('PUT /api/v1/access-control/users/:id/profiles retorna 200 con permiso dedicado de asignacion', async () => {
    accessControlServiceMock.replaceUserProfiles.mockResolvedValue({
      userId: '243f5a18-4adc-4ca5-8cce-f55b70a3412e',
      role: UserRole.ADMIN,
      profileIds: ['243f5a18-4adc-4ca5-8cce-f55b70a3412e'],
    });

    await request(app.getHttpServer())
      .put('/api/v1/access-control/users/243f5a18-4adc-4ca5-8cce-f55b70a3412e/profiles')
      .set('Authorization', 'Bearer admin-assignments-only-token')
      .send({ profileIds: ['243f5a18-4adc-4ca5-8cce-f55b70a3412e'] })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.role).toBe(UserRole.ADMIN);
      });
  });

  it('GET /api/v1/access-control/me/effective-permissions retorna resumen self-service del usuario autenticado', async () => {
    accessControlServiceMock.getEffectivePermissionsSummary.mockResolvedValue({
      userId: 'usr-support',
      role: UserRole.SUPPORT,
      effectivePermissions: [AccessPermissionKey.SETTINGS_READ],
      recoveryPermissions: [],
      profileSources: [],
    });

    await request(app.getHttpServer())
      .get('/api/v1/access-control/me/effective-permissions')
      .set('Authorization', 'Bearer support-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.userId).toBe('usr-support');
        expect(body.data.effectivePermissions).toEqual([AccessPermissionKey.SETTINGS_READ]);
      });
  });

  it('GET /api/v1/access-control/users/:id/effective-permissions retorna resumen efectivo', async () => {
    accessControlServiceMock.getEffectivePermissionsSummary.mockResolvedValue({
      userId: '243f5a18-4adc-4ca5-8cce-f55b70a3412e',
      role: UserRole.NOC,
      effectivePermissions: [AccessPermissionKey.SETTINGS_READ],
      recoveryPermissions: [],
      profileSources: [
        {
          profileId: 'profile-1',
          profileName: 'Perfil NOC lectura',
          permissions: [AccessPermissionKey.SETTINGS_READ],
        },
      ],
    });

    await request(app.getHttpServer())
      .get(
        '/api/v1/access-control/users/243f5a18-4adc-4ca5-8cce-f55b70a3412e/effective-permissions',
      )
      .set('Authorization', 'Bearer admin-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.effectivePermissions).toEqual([AccessPermissionKey.SETTINGS_READ]);
        expect(body.data.profileSources[0].profileName).toBe('Perfil NOC lectura');
      });
  });
});
