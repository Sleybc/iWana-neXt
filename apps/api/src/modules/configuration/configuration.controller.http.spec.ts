import {
  ForbiddenException,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import {
  AccessPermissionKey,
  SettingsPriorityEvaluation,
  SettingsPriorityKey,
  SettingsPriorityLevel,
  SettingsPrioritySource,
  SettingsPriorityState,
  SettingsSectionKey,
  SettingsSectionStatus,
  UserRole,
} from '@iwana/shared';
import { PermissionsGuard } from '../access-control/guards/permissions.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ConfigurationController } from './configuration.controller';
import { SettingsRegistryService } from './services/settings-registry.service';
import { SettingsPriorityService } from './services/settings-priority.service';

jest.mock('../auth/guards/jwt-auth.guard', () => ({
  JwtAuthGuard: class JwtAuthGuard {
    canActivate(context: {
      getHandler: () => unknown;
      getClass: () => unknown;
      switchToHttp: () => {
        getRequest: () => {
          headers: Record<string, string | undefined>;
          user?: JwtPayload;
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

      const req = context.switchToHttp().getRequest();
      const authHeader = req.headers.authorization;

      if (
        authHeader === 'Bearer admin-token' ||
        authHeader === 'Bearer admin-no-permission-token'
      ) {
        req.user = {
          sub: 'admin-001',
          email: 'admin@test.com',
          role: UserRole.ADMIN,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          jti: 'jti-admin',
          type: 'tenant',
        } as JwtPayload;
        return true;
      }

      if (authHeader === 'Bearer support-token') {
        req.user = {
          sub: 'support-001',
          email: 'support@test.com',
          role: UserRole.SUPPORT,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          jti: 'jti-support',
          type: 'tenant',
        } as JwtPayload;
        return true;
      }

      if (authHeader === 'Bearer subscriber-token') {
        req.user = {
          sub: 'subscriber-001',
          email: 'subscriber@test.com',
          role: UserRole.SUBSCRIBER,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          jti: 'jti-subscriber',
          type: 'tenant',
        } as JwtPayload;
        return true;
      }

      if (authHeader === 'Bearer platform-admin-token') {
        req.user = {
          sub: 'platform-admin-001',
          email: 'platform-admin-hash',
          role: UserRole.ADMIN,
          tenantId: null,
          schemaName: null,
          jti: 'jti-platform-admin',
          type: 'platform',
        } as JwtPayload;
        return true;
      }

      throw new UnauthorizedException('Token de acceso invalido o expirado.');
    }
  },
}));

jest.mock('../access-control/guards/permissions.guard', () => ({
  PermissionsGuard: class PermissionsGuard {
    canActivate(context: {
      switchToHttp: () => {
        getRequest: () => { headers: Record<string, string | undefined> };
      };
    }): boolean {
      const authHeader = context.switchToHttp().getRequest().headers.authorization;
      if (authHeader === 'Bearer admin-no-permission-token') {
        throw new ForbiddenException('No tiene el permiso requerido.');
      }
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

      if (requiredRoles.length === 0) {
        return true;
      }

      if (!user || !requiredRoles.includes(user.role)) {
        throw new ForbiddenException('No tiene permisos para ejecutar esta accion.');
      }

      return true;
    }
  },
}));

describe('ConfigurationController HTTP', () => {
  let app: INestApplication;
  const settingsPriorityService = {
    getPriority: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ConfigurationController],
      providers: [
        SettingsRegistryService,
        { provide: SettingsPriorityService, useValue: settingsPriorityService },
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
      }),
    );
    await app.init();
  });

  beforeEach(() => {
    settingsPriorityService.getPriority.mockReset();
    settingsPriorityService.getPriority.mockResolvedValue({
      state: SettingsPriorityState.ACTION_REQUIRED,
      item: {
        key: SettingsPriorityKey.MFA_POLICY_DISABLED,
        level: SettingsPriorityLevel.HIGH,
        sectionKey: SettingsSectionKey.ACCESS,
        targetPath: '/dashboard/settings/access#politicas-de-autenticacion',
      },
      evaluation: SettingsPriorityEvaluation.COMPLETE,
      unknownSources: [],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('lista las secciones federadas visibles para SUPPORT', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/configuration/settings-sections')
      .set('Authorization', 'Bearer support-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              key: SettingsSectionKey.ORGANIZATION,
              status: SettingsSectionStatus.AVAILABLE,
              route: '/dashboard/settings/organization',
              requiredPermissions: [
                AccessPermissionKey.SETTINGS_READ,
                AccessPermissionKey.ORGANIZATION_SITES_READ,
              ],
            }),
            expect.objectContaining({
              key: SettingsSectionKey.BRANDING,
              status: SettingsSectionStatus.AVAILABLE,
              route: '/dashboard/settings/branding',
            }),
            expect.objectContaining({
              key: SettingsSectionKey.BILLING,
              status: SettingsSectionStatus.COMING_SOON,
              route: null,
            }),
            expect.objectContaining({
              key: SettingsSectionKey.CALENDAR,
              status: SettingsSectionStatus.AVAILABLE,
              route: '/dashboard/settings/calendar',
              requiredPermissions: [AccessPermissionKey.SETTINGS_READ],
            }),
            expect.objectContaining({
              key: SettingsSectionKey.RULES,
              status: SettingsSectionStatus.AVAILABLE,
              route: '/dashboard/settings/rules',
              requiredPermissions: [AccessPermissionKey.SETTINGS_READ],
            }),
          ]),
        );
        expect(body.data).not.toContainEqual(
          expect.objectContaining({
            key: 'security',
            route: '/dashboard/settings/security',
          }),
        );
        expect(body.data).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              key: SettingsSectionKey.ACCESS,
              label: 'Perfiles y autenticación',
              description: 'Consulta perfiles, permisos y políticas de autenticación.',
            }),
            expect.objectContaining({
              key: SettingsSectionKey.BRANDING,
              description: 'Gestiona la identidad visual y los activos corporativos.',
            }),
            expect.objectContaining({
              key: SettingsSectionKey.BILLING,
              label: 'Facturación',
            }),
            expect.objectContaining({
              key: SettingsSectionKey.INVENTORY,
              label: 'Inventario',
            }),
          ]),
        );
      });
  });

  it('entrega la prioridad calculada para ADMIN con SETTINGS_READ', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/configuration/settings-priority')
      .set('Authorization', 'Bearer admin-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toEqual({
          state: SettingsPriorityState.ACTION_REQUIRED,
          item: {
            key: SettingsPriorityKey.MFA_POLICY_DISABLED,
            level: SettingsPriorityLevel.HIGH,
            sectionKey: SettingsSectionKey.ACCESS,
            targetPath: '/dashboard/settings/access#politicas-de-autenticacion',
          },
          evaluation: SettingsPriorityEvaluation.COMPLETE,
          unknownSources: [],
        });
      });

    expect(settingsPriorityService.getPriority).toHaveBeenCalledWith({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    });
  });

  it('preserva evaluación parcial sin exponer errores internos', async () => {
    settingsPriorityService.getPriority.mockResolvedValue({
      state: SettingsPriorityState.UNKNOWN,
      item: null,
      evaluation: SettingsPriorityEvaluation.PARTIAL,
      unknownSources: [SettingsPrioritySource.ORGANIZATION],
    });

    await request(app.getHttpServer())
      .get('/api/v1/configuration/settings-priority')
      .set('Authorization', 'Bearer admin-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toEqual({
          state: SettingsPriorityState.UNKNOWN,
          item: null,
          evaluation: SettingsPriorityEvaluation.PARTIAL,
          unknownSources: [SettingsPrioritySource.ORGANIZATION],
        });
        expect(JSON.stringify(body)).not.toContain('stack');
        expect(JSON.stringify(body)).not.toContain('error');
      });
  });

  it('rechaza ADMIN sin SETTINGS_READ', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/configuration/settings-priority')
      .set('Authorization', 'Bearer admin-no-permission-token')
      .expect(403);
  });

  it('rechaza un rol distinto de ADMIN en settings-priority', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/configuration/settings-priority')
      .set('Authorization', 'Bearer support-token')
      .expect(403);
  });

  it('rechaza una sesión de plataforma sin contexto tenant', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/configuration/settings-priority')
      .set('Authorization', 'Bearer platform-admin-token')
      .expect(401);
  });

  it('rechaza settings-priority sin token', async () => {
    await request(app.getHttpServer()).get('/api/v1/configuration/settings-priority').expect(401);
  });

  it('publica enums y nulabilidad del contrato en OpenAPI', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().addBearerAuth(undefined, 'access-token').build(),
    );
    const priorityPath = Object.keys(document.paths).find((path) =>
      path.endsWith('/configuration/settings-priority'),
    );
    const operation = priorityPath ? document.paths[priorityPath]?.get : undefined;
    const responseSchema = document.components?.schemas?.SettingsPriorityResponseDto as {
      properties?: Record<string, { nullable?: boolean }>;
    };
    const stateSchema = document.components?.schemas?.SettingsPriorityState as {
      enum?: string[];
    };
    const evaluationSchema = document.components?.schemas?.SettingsPriorityEvaluation as {
      enum?: string[];
    };
    const keySchema = document.components?.schemas?.SettingsPriorityKey as {
      enum?: string[];
    };
    const levelSchema = document.components?.schemas?.SettingsPriorityLevel as {
      enum?: string[];
    };
    const sourceSchema = document.components?.schemas?.SettingsPrioritySource as {
      enum?: string[];
    };

    expect(operation?.responses?.['200']).toBeDefined();
    expect(operation?.responses?.['401']).toBeDefined();
    expect(operation?.responses?.['403']).toBeDefined();
    expect(stateSchema.enum).toEqual(expect.arrayContaining(Object.values(SettingsPriorityState)));
    expect(evaluationSchema.enum).toEqual(
      expect.arrayContaining(Object.values(SettingsPriorityEvaluation)),
    );
    expect(keySchema.enum).toEqual(expect.arrayContaining(Object.values(SettingsPriorityKey)));
    expect(levelSchema.enum).toEqual(expect.arrayContaining(Object.values(SettingsPriorityLevel)));
    expect(sourceSchema.enum).toEqual(
      expect.arrayContaining(Object.values(SettingsPrioritySource)),
    );
    expect(responseSchema.properties?.item?.nullable).toBe(true);
  });

  it('rechaza un rol sin acceso al shell federado', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/configuration/settings-sections')
      .set('Authorization', 'Bearer subscriber-token')
      .expect(403);
  });

  it('rechaza solicitudes sin token', async () => {
    await request(app.getHttpServer()).get('/api/v1/configuration/settings-sections').expect(401);
  });
});
