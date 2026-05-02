import {
  BadRequestException,
  ForbiddenException,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { MediaUsage } from '@iwana/db';
import { PlatformRole, UserRole } from '@iwana/shared';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { MediaAssetResponseDto } from '../media/dto/media-asset-response.dto';
import { TenantController } from './tenant.controller';
import { TenantService } from './tenant.service';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { DashboardSummaryService } from './dashboard-summary.service';
import { AuthService } from '../auth/auth.service';

jest.mock('../auth/auth.service', () => ({
  AuthService: class AuthService {},
}));

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

      if (authHeader === 'Bearer tenant-admin-token') {
        req.user = {
          sub: 'tenant-admin-sub',
          email: 'hash-admin',
          role: UserRole.ADMIN,
          tenantId: 'tenant-uuid-1',
          schemaName: 'tenant_test_isp',
          jti: 'jti-admin',
          type: 'tenant',
        };
        return true;
      }

      if (authHeader === 'Bearer tenant-sales-token') {
        req.user = {
          sub: 'tenant-sales-sub',
          email: 'hash-sales',
          role: UserRole.SALES,
          tenantId: 'tenant-uuid-1',
          schemaName: 'tenant_test_isp',
          jti: 'jti-sales',
          type: 'tenant',
        };
        return true;
      }

      if (authHeader === 'Bearer platform-admin-token') {
        req.user = {
          sub: 'platform-admin-sub',
          email: 'hash-platform-admin',
          role: PlatformRole.SYSTEM_ADMIN,
          tenantId: null,
          schemaName: null,
          jti: 'jti-platform-admin',
          type: 'platform',
        };
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
        throw new ForbiddenException('No tiene permisos para ejecutar esta acción.');
      }

      return true;
    }
  },
}));

describe('TenantController HTTP', () => {
  let app: INestApplication;

  const brandingAsset: MediaAssetResponseDto = {
    id: '55555555-5555-4555-8555-555555555555',
    usage: MediaUsage.LOGO,
    themeVariant: 'light',
    mimeType: 'image/png',
    sizeBytes: 1024,
    publicUrl: 'https://media.example.test/tenant/logo-light.png',
    createdAt: new Date('2026-04-30T12:00:00.000Z'),
  };

  const tenantService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    suspend: jest.fn(),
    activate: jest.fn(),
    getTenantSelf: jest.fn(),
    getTenantSelfSettings: jest.fn(),
    updateTenantSelfProfile: jest.fn(),
    updateTenantSelfSettings: jest.fn(),
    updateTenantSelfBranding: jest.fn(),
    getTenantPublicBranding: jest.fn(),
    uploadTenantBrandingAsset: jest.fn(),
    updateTenantBranding: jest.fn(),
  };

  const provisioningService = { enqueue: jest.fn() };
  const authService = {
    getBootstrapTenantAdminCredentials: jest.fn(),
    regenerateTenantAdminCredentials: jest.fn(),
  };
  const dashboardSummaryService = { getSummary: jest.fn() };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [TenantController],
      providers: [
        { provide: TenantService, useValue: tenantService },
        { provide: TenantProvisioningService, useValue: provisioningService },
        { provide: AuthService, useValue: authService },
        { provide: DashboardSummaryService, useValue: dashboardSummaryService },
        JwtAuthGuard,
        RolesGuard,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: false,
      }),
    );
    await app.init();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/tenants/public-branding retorna branding público sin autenticación', async () => {
    tenantService.getTenantPublicBranding.mockResolvedValue({
      displayName: 'Empresa Test ISP',
      productName: 'Empresa Test ISP',
      surfaceName: 'Portal empresarial',
      metadataTitle: 'Empresa Test ISP — Portal empresarial',
      metadataDescription:
        'Portal empresarial para la operación de Empresa Test ISP en iWana neXt.',
      showTenantName: true,
      logoLightUrl: 'https://cdn.example.test/logo-light.png',
      logoDarkUrl: null,
      sealLightUrl: null,
      sealDarkUrl: null,
      faviconLightUrl: null,
      faviconDarkUrl: null,
      loginBackgroundLightUrl: null,
      loginBackgroundDarkUrl: null,
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/tenants/public-branding')
      .query({ slug: 'empresa-test' })
      .expect(200);

    expect(response.headers['cache-control']).toBe('public, max-age=60');
    expect(response.body.data.displayName).toBe('Empresa Test ISP');
    expect(response.body.data.metadataTitle).toBe('Empresa Test ISP — Portal empresarial');
    expect(tenantService.getTenantPublicBranding).toHaveBeenCalledWith('empresa-test');
  });

  it('GET /api/v1/tenants/public-branding normaliza slug con trim y lowercase', async () => {
    tenantService.getTenantPublicBranding.mockResolvedValue({
      displayName: 'Empresa Test ISP',
      productName: 'Empresa Test ISP',
      surfaceName: 'Portal empresarial',
      metadataTitle: 'Empresa Test ISP — Portal empresarial',
      metadataDescription:
        'Portal empresarial para la operación de Empresa Test ISP en iWana neXt.',
      showTenantName: true,
      logoLightUrl: 'https://cdn.example.test/logo-light.png',
      logoDarkUrl: null,
      sealLightUrl: null,
      sealDarkUrl: null,
      faviconLightUrl: null,
      faviconDarkUrl: null,
      loginBackgroundLightUrl: null,
      loginBackgroundDarkUrl: null,
    });

    await request(app.getHttpServer())
      .get('/api/v1/tenants/public-branding')
      .query({ slug: '  EMPRESA-TEST  ' })
      .expect(200);

    expect(tenantService.getTenantPublicBranding).toHaveBeenCalledWith('  EMPRESA-TEST  ');
  });

  it('GET /api/v1/tenants/public-branding retorna 400 si falta slug', async () => {
    tenantService.getTenantPublicBranding.mockRejectedValueOnce(
      new BadRequestException('slug es requerido.'),
    );

    await request(app.getHttpServer()).get('/api/v1/tenants/public-branding').expect(400);

    expect(tenantService.getTenantPublicBranding).toHaveBeenCalledWith('');
  });

  it('GET /api/v1/tenants/public-branding retorna 400 si slug contiene solo espacios', async () => {
    tenantService.getTenantPublicBranding.mockRejectedValue(
      new BadRequestException('slug es requerido.'),
    );

    await request(app.getHttpServer())
      .get('/api/v1/tenants/public-branding')
      .query({ slug: '   ' })
      .expect(400);

    expect(tenantService.getTenantPublicBranding).toHaveBeenCalledWith('   ');
  });

  it('PATCH /api/v1/tenants/me/branding actualiza branding híbrido para ADMIN', async () => {
    tenantService.updateTenantSelfBranding.mockResolvedValue({
      id: 'tenant-uuid-1',
      logoLightUrl: 'https://cdn.example.test/logo-light.png',
      logoLightAssetId: null,
    });

    const response = await request(app.getHttpServer())
      .patch('/api/v1/tenants/me/branding')
      .set('Authorization', 'Bearer tenant-admin-token')
      .send({ logoLightUrl: 'https://cdn.example.test/logo-light.png' })
      .expect(200);

    expect(response.body.data.logoLightUrl).toBe('https://cdn.example.test/logo-light.png');
    expect(tenantService.updateTenantSelfBranding).toHaveBeenCalledWith(
      'tenant-uuid-1',
      expect.objectContaining({ logoLightUrl: 'https://cdn.example.test/logo-light.png' }),
      'tenant-admin-sub',
    );
  });

  it('PATCH /api/v1/tenants/me/branding rechaza payload con URL y assetId del mismo slot', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/tenants/me/branding')
      .set('Authorization', 'Bearer tenant-admin-token')
      .send({
        logoLightUrl: 'https://cdn.example.test/logo-light.png',
        logoLightAssetId: '55555555-5555-4555-8555-555555555555',
      })
      .expect(400);

    expect(tenantService.updateTenantSelfBranding).not.toHaveBeenCalled();
  });

  it('PATCH /api/v1/tenants/me/branding permite limpiar un slot enviando url y assetId en null', async () => {
    tenantService.updateTenantSelfBranding.mockResolvedValue({
      id: 'tenant-uuid-1',
      loginBackgroundLightUrl: null,
      loginBackgroundLightAssetId: null,
    });

    const response = await request(app.getHttpServer())
      .patch('/api/v1/tenants/me/branding')
      .set('Authorization', 'Bearer tenant-admin-token')
      .send({
        loginBackgroundLightUrl: null,
        loginBackgroundLightAssetId: null,
      })
      .expect(200);

    expect(response.body.data.loginBackgroundLightUrl).toBeNull();
    expect(tenantService.updateTenantSelfBranding).toHaveBeenCalledWith(
      'tenant-uuid-1',
      expect.objectContaining({
        loginBackgroundLightUrl: null,
        loginBackgroundLightAssetId: null,
      }),
      'tenant-admin-sub',
    );
  });

  it('PATCH /api/v1/tenants/me/branding permite URL externa con assetId null para reemplazar un asset previo', async () => {
    tenantService.updateTenantSelfBranding.mockResolvedValue({
      id: 'tenant-uuid-1',
      loginBackgroundLightUrl: 'https://cdn.example.test/login-bg-light.png',
      loginBackgroundLightAssetId: null,
    });

    const response = await request(app.getHttpServer())
      .patch('/api/v1/tenants/me/branding')
      .set('Authorization', 'Bearer tenant-admin-token')
      .send({
        loginBackgroundLightUrl: 'https://cdn.example.test/login-bg-light.png',
        loginBackgroundLightAssetId: null,
      })
      .expect(200);

    expect(response.body.data.loginBackgroundLightUrl).toBe(
      'https://cdn.example.test/login-bg-light.png',
    );
    expect(tenantService.updateTenantSelfBranding).toHaveBeenCalledWith(
      'tenant-uuid-1',
      expect.objectContaining({
        loginBackgroundLightUrl: 'https://cdn.example.test/login-bg-light.png',
        loginBackgroundLightAssetId: null,
      }),
      'tenant-admin-sub',
    );
  });

  it('PATCH /api/v1/tenants/me/branding rechaza metadata inválida por longitud', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/tenants/me/branding')
      .set('Authorization', 'Bearer tenant-admin-token')
      .send({
        brandingProductName: 'A',
      })
      .expect(400);

    expect(tenantService.updateTenantSelfBranding).not.toHaveBeenCalled();
  });

  it('PATCH /api/v1/tenants/me/branding retorna 403 para un rol sin permiso', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/tenants/me/branding')
      .set('Authorization', 'Bearer tenant-sales-token')
      .send({ logoLightUrl: 'https://cdn.example.test/logo-light.png' })
      .expect(403);

    expect(tenantService.updateTenantSelfBranding).not.toHaveBeenCalled();
  });

  it('POST /api/v1/tenants/me/branding/assets sube y asigna asset multipart', async () => {
    tenantService.uploadTenantBrandingAsset.mockResolvedValue(brandingAsset);

    const response = await request(app.getHttpServer())
      .post('/api/v1/tenants/me/branding/assets')
      .set('Authorization', 'Bearer tenant-admin-token')
      .field('usage', MediaUsage.LOGO)
      .field('themeVariant', 'light')
      .attach('file', Buffer.from('fake-png-bytes'), {
        filename: 'logo.png',
        contentType: 'image/png',
      })
      .expect(201);

    expect(response.body.data.id).toBe('55555555-5555-4555-8555-555555555555');
    expect(tenantService.uploadTenantBrandingAsset).toHaveBeenCalledWith(
      'tenant-uuid-1',
      expect.objectContaining({ usage: MediaUsage.LOGO, themeVariant: 'light' }),
      expect.objectContaining({ originalname: 'logo.png', mimetype: 'image/png' }),
      'tenant-admin-sub',
    );
  });

  it('POST /api/v1/tenants/:id/branding/assets sube asset para plataforma', async () => {
    tenantService.uploadTenantBrandingAsset.mockResolvedValue({
      ...brandingAsset,
      themeVariant: 'dark',
    });

    await request(app.getHttpServer())
      .post('/api/v1/tenants/44444444-4444-4444-8444-444444444444/branding/assets')
      .set('Authorization', 'Bearer platform-admin-token')
      .field('usage', MediaUsage.LOGO)
      .field('themeVariant', 'dark')
      .attach('file', Buffer.from('fake-dark-logo'), {
        filename: 'logo-dark.png',
        contentType: 'image/png',
      })
      .expect(201);

    expect(tenantService.uploadTenantBrandingAsset).toHaveBeenCalledWith(
      '44444444-4444-4444-8444-444444444444',
      expect.objectContaining({ usage: MediaUsage.LOGO, themeVariant: 'dark' }),
      expect.objectContaining({ originalname: 'logo-dark.png' }),
      'platform-admin-sub',
    );
  });

  it('POST /api/v1/tenants/me/branding/assets retorna 400 si no se envía archivo', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/tenants/me/branding/assets')
      .set('Authorization', 'Bearer tenant-admin-token')
      .field('usage', MediaUsage.LOGO)
      .field('themeVariant', 'light')
      .expect(400);

    expect(tenantService.uploadTenantBrandingAsset).not.toHaveBeenCalled();
  });
});
