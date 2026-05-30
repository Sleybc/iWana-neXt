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
  SettingsSectionKey,
  SettingsSectionStatus,
  UserRole,
} from '@iwana/shared';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ConfigurationController } from './configuration.controller';
import { SettingsRegistryService } from './services/settings-registry.service';

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

      if (authHeader === 'Bearer admin-token') {
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

      throw new UnauthorizedException('Token de acceso invalido o expirado.');
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

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ConfigurationController],
      providers: [SettingsRegistryService, JwtAuthGuard, RolesGuard],
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
          ]),
        );
        expect(body.data).not.toContainEqual(
          expect.objectContaining({
            key: 'security',
            route: '/dashboard/settings/security',
          }),
        );
      });
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
