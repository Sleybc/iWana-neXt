import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TenantContext } from '@iwana/db';
import { PlatformRole, UserRole } from '@iwana/shared';
import request from 'supertest';
import type { NextFunction, Request, Response } from 'express';
import { AuthController } from '../modules/auth/auth.controller';
import { AuthService } from '../modules/auth/auth.service';
import { JwtAuthGuard } from '../modules/auth/guards/jwt-auth.guard';
import { IS_PUBLIC_KEY } from '../modules/auth/decorators/public.decorator';
import { JwtPayload } from '../modules/auth/interfaces/jwt-payload.interface';
import { MediaController } from '../modules/media/media.controller';
import { MediaService } from '../modules/media/media.service';
import { PlatformBrandingController } from '../modules/platform-branding/platform-branding.controller';
import { PlatformBrandingService } from '../modules/platform-branding/platform-branding.service';
import { PrivacyEvidenceController } from '../modules/privacy/evidence/privacy-evidence.controller';
import { AuditService } from '../modules/audit/audit.service';
import { TenantController } from '../modules/tenant/tenant.controller';
import { TenantService } from '../modules/tenant/tenant.service';
import { TenantProvisioningService } from '../modules/tenant/tenant-provisioning.service';
import { DashboardSummaryService } from '../modules/tenant/dashboard-summary.service';
import { UsersController } from '../modules/users/users.controller';
import { UsersService } from '../modules/users/users.service';
import { getGlobalRateLimitTracker } from './rate-limit-tracker';

// Se mockea AuthService para no cargar su cadena (otplib, repositorios, etc.);
// el test solo necesita el ThrottlerGuard real y el tracker de app.module.ts.
jest.mock('../modules/auth/auth.service', () => ({
  AuthService: class AuthService {},
}));

jest.mock('../modules/auth/guards/jwt-auth.guard', () => ({
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
      if (authHeader === 'Bearer tenant-user-1') {
        req.user = {
          sub: '11111111-1111-4111-8111-111111111111',
          email: 'hash-tenant-user-1',
          role: UserRole.ADMIN,
          tenantId: '22222222-2222-4222-8222-222222222222',
          schemaName: 'tenant_rate_limit_test',
          jti: 'jti-tenant-user-1',
          type: 'tenant',
        };
        return true;
      }
      if (authHeader === 'Bearer tenant-user-2') {
        req.user = {
          sub: '33333333-3333-4333-8333-333333333333',
          email: 'hash-tenant-user-2',
          role: UserRole.ADMIN,
          tenantId: '22222222-2222-4222-8222-222222222222',
          schemaName: 'tenant_rate_limit_test',
          jti: 'jti-tenant-user-2',
          type: 'tenant',
        };
        return true;
      }
      if (authHeader === 'Bearer platform-admin-token') {
        req.user = {
          sub: '44444444-4444-4444-8444-444444444444',
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

jest.mock('../modules/auth/guards/roles.guard', () => ({
  RolesGuard: class RolesGuard {
    canActivate(): boolean {
      return true;
    }
  },
}));

jest.mock('../modules/access-control/guards/permissions.guard', () => ({
  PermissionsGuard: class PermissionsGuard {
    canActivate(): boolean {
      return true;
    }
  },
}));

jest.mock('../modules/auth/guards/abac.guard', () => ({
  AbacGuard: class AbacGuard {
    canActivate(): boolean {
      return true;
    }
  },
}));

jest.mock('../modules/auth/guards/platform-only.guard', () => ({
  PlatformOnlyGuard: class PlatformOnlyGuard {
    canActivate(): boolean {
      return true;
    }
  },
}));

const TENANT_USER_1 = 'Bearer tenant-user-1';
const PLATFORM_ADMIN = 'Bearer platform-admin-token';
const TENANT_UUID = '55555555-5555-4555-8555-555555555555';
const USER_UUID = '66666666-6666-4666-8666-666666666666';
const ASSET_STUB = {
  id: '77777777-7777-4777-8777-777777777777',
  usage: 'logo',
  themeVariant: 'light',
  mimeType: 'image/png',
  sizeBytes: 128,
  publicUrl: 'https://media.example.test/logo.png',
  createdAt: new Date('2026-11-06T12:00:00.000Z'),
};

type TestRequest = request.Test;

interface RouteCase {
  name: string;
  method: 'get' | 'post' | 'patch';
  url: string;
  limit: number;
  successStatus: number;
  build: (server: unknown) => TestRequest;
}

function tenantMiddleware(
  req: Request & {
    iwanaTenantResolutionSource?: string;
    iwanaVerifiedSub?: string;
  },
  _res: Response,
  next: NextFunction,
): void {
  req.iwanaTenantResolutionSource = 'none';
  const authHeader = req.headers.authorization;
  if (authHeader === 'Bearer tenant-user-1' || authHeader === 'Bearer tenant-user-2') {
    const sub =
      authHeader === 'Bearer tenant-user-1'
        ? '11111111-1111-4111-8111-111111111111'
        : '33333333-3333-4333-8333-333333333333';
    req.iwanaTenantResolutionSource = 'jwt-verified';
    req.iwanaVerifiedSub = sub;
    TenantContext.run(
      {
        tenantId: '22222222-2222-4222-8222-222222222222',
        schemaName: 'tenant_rate_limit_test',
        tenantSlug: 'rate-limit-test',
      },
      () => next(),
    );
    return;
  }
  if (authHeader === 'Bearer platform-admin-token') {
    req.iwanaTenantResolutionSource = 'jwt-verified';
    req.iwanaVerifiedSub = '44444444-4444-4444-8444-444444444444';
    next();
    return;
  }
  next();
}

async function buildApp(): Promise<INestApplication> {
  const authService = {
    login: jest.fn().mockResolvedValue({ accessToken: 'jwt-access-1', refreshToken: 'refresh-1' }),
    loginPlatform: jest
      .fn()
      .mockResolvedValue({ accessToken: 'jwt-platform-1', refreshToken: 'platform-refresh-1' }),
    refreshTokens: jest
      .fn()
      .mockResolvedValue({ accessToken: 'jwt-access-2', refreshToken: 'refresh-2' }),
    refreshPlatformTokens: jest
      .fn()
      .mockResolvedValue({ accessToken: 'jwt-platform-2', refreshToken: 'platform-refresh-2' }),
    logout: jest.fn().mockResolvedValue(undefined),
    setupMfa: jest.fn(),
    verifyMfaSetup: jest.fn(),
    disableMfa: jest.fn(),
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
    changePassword: jest.fn().mockResolvedValue(undefined),
    verifyEmail: jest.fn(),
    resendVerificationEmail: jest.fn(),
    getBootstrapTenantAdminCredentials: jest.fn(),
    regenerateTenantAdminCredentials: jest.fn(),
  };
  const tenantService = {
    create: jest
      .fn()
      .mockResolvedValue({
        id: TENANT_UUID,
        schemaName: 'tenant_rate_limit_test',
        slug: 'rate-limit-test',
      }),
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
    getTenantPublicBranding: jest.fn().mockResolvedValue({
      displayName: 'Rate Limit Test',
      productName: 'Rate Limit Test',
      surfaceName: 'Portal',
      metadataTitle: 'Rate Limit Test — Portal',
      metadataDescription: 'Portal de prueba de limite',
      showTenantName: true,
      logoLightUrl: null,
      logoDarkUrl: null,
      sealLightUrl: null,
      sealDarkUrl: null,
      faviconLightUrl: null,
      faviconDarkUrl: null,
      loginBackgroundLightUrl: null,
      loginBackgroundDarkUrl: null,
    }),
    uploadTenantBrandingAsset: jest.fn().mockResolvedValue(ASSET_STUB),
    updateTenantBranding: jest.fn(),
    getCoverageAdmin: jest.fn(),
    checkCoverage: jest.fn(),
    getSettings: jest.fn(),
    updateSettings: jest.fn(),
  };
  const provisioningService = {
    enqueue: jest.fn().mockResolvedValue(undefined),
    retryProvisioning: jest.fn(),
  };
  const dashboardSummaryService = { getSummary: jest.fn() };
  const usersService = {
    changeLoginEmail: jest
      .fn()
      .mockResolvedValue({ id: USER_UUID, email: 'nuevo.acceso@example.test' }),
    changeLoginEmailAsAdmin: jest.fn(),
    findAll: jest.fn(),
    searchForPicker: jest.fn(),
    create: jest.fn(),
    findMe: jest.fn(),
    updateMe: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    resetPassword: jest.fn(),
    remove: jest.fn(),
  };
  const mediaService = {
    upload: jest.fn().mockResolvedValue(ASSET_STUB),
    uploadPrivacyEvidence: jest
      .fn()
      .mockResolvedValue({ id: ASSET_STUB.id, mimeType: 'image/png', sizeBytes: 128 }),
    getSignedUrl: jest.fn(),
    softDelete: jest.fn(),
  };
  const auditService = { log: jest.fn().mockResolvedValue(undefined) };
  const platformBrandingService = {
    getPublicBranding: jest.fn().mockResolvedValue({
      productName: 'Plataforma',
      surfaceName: 'Consola',
      metadataTitle: 'Plataforma',
      metadataDescription: 'Consola de plataforma',
      logoUrl: null,
      faviconUrl: null,
      loginBackgroundLightUrl: null,
      loginBackgroundDarkUrl: null,
    }),
    getAdminBranding: jest.fn(),
    updateBranding: jest.fn(),
    resetBranding: jest.fn(),
    uploadBrandingAsset: jest.fn().mockResolvedValue(ASSET_STUB),
  };

  const moduleRef: TestingModule = await Test.createTestingModule({
    // Configuracion identica a app.module.ts: unica throttla `global` 100/min.
    imports: [
      ThrottlerModule.forRoot([
        { name: 'global', ttl: 60000, limit: 100, getTracker: getGlobalRateLimitTracker },
      ]),
    ],
    controllers: [
      AuthController,
      TenantController,
      UsersController,
      MediaController,
      PrivacyEvidenceController,
      PlatformBrandingController,
    ],
    providers: [
      { provide: AuthService, useValue: authService },
      { provide: TenantService, useValue: tenantService },
      { provide: TenantProvisioningService, useValue: provisioningService },
      { provide: DashboardSummaryService, useValue: dashboardSummaryService },
      { provide: UsersService, useValue: usersService },
      { provide: MediaService, useValue: mediaService },
      { provide: AuditService, useValue: auditService },
      { provide: PlatformBrandingService, useValue: platformBrandingService },
      {
        provide: ConfigService,
        useValue: {
          get: jest.fn().mockImplementation((_key: string, fallback?: unknown) => fallback),
        },
      },
      JwtAuthGuard,
      { provide: APP_GUARD, useClass: ThrottlerGuard },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  (app as unknown as { set: (key: string, value: number) => void }).set('trust proxy', 1);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.use(require('cookie-parser')());
  app.use(tenantMiddleware);
  await app.init();
  return app;
}

const PUBLIC_BRANDING_URL = '/api/v1/tenants/public-branding?slug=rate-limit-test';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const routeCases: RouteCase[] = [
  {
    name: 'POST /auth/refresh (60, IP)',
    method: 'post',
    url: '/api/v1/auth/refresh',
    limit: 60,
    successStatus: 200,
    build: (server) =>
      request(server as never)
        .post('/api/v1/auth/refresh')
        .set('Cookie', ['refreshToken=refresh-token-1'])
        .set('User-Agent', 'rate-limit-ca1'),
  },
  {
    name: 'POST /auth/change-password (10, usuario)',
    method: 'post',
    url: '/api/v1/auth/change-password',
    limit: 10,
    successStatus: 200,
    build: (server) =>
      request(server as never)
        .post('/api/v1/auth/change-password')
        .set('Authorization', TENANT_USER_1)
        .send({ currentPassword: 'OldPassw0rd!', newPassword: 'NewPassw0rd!' })
        .set('User-Agent', 'rate-limit-ca1'),
  },
  {
    name: 'PATCH /users/:id/login-email (10, usuario)',
    method: 'patch',
    url: `/api/v1/users/${USER_UUID}/login-email`,
    limit: 10,
    successStatus: 200,
    build: (server) =>
      request(server as never)
        .patch(`/api/v1/users/${USER_UUID}/login-email`)
        .set('Authorization', TENANT_USER_1)
        .send({ email: 'nuevo.acceso@example.test', currentPassword: 'Passw0rd!!' })
        .set('User-Agent', 'rate-limit-ca1'),
  },
  {
    name: 'POST /media/upload (20, usuario)',
    method: 'post',
    url: '/api/v1/media/upload',
    limit: 20,
    successStatus: 201,
    build: (server) =>
      request(server as never)
        .post('/api/v1/media/upload')
        .set('Authorization', TENANT_USER_1)
        .field('usage', 'general')
        .attach('file', PNG, { filename: 'logo.png', contentType: 'image/png' })
        .set('User-Agent', 'rate-limit-ca1'),
  },
  {
    name: 'POST /privacy/evidence (20, usuario)',
    method: 'post',
    url: '/api/v1/privacy/evidence',
    limit: 20,
    successStatus: 201,
    build: (server) =>
      request(server as never)
        .post('/api/v1/privacy/evidence')
        .set('Authorization', TENANT_USER_1)
        .attach('file', PNG, { filename: 'evidencia.png', contentType: 'image/png' })
        .set('User-Agent', 'rate-limit-ca1'),
  },
  {
    name: 'GET /tenants/public-branding (60, IP sin sesion)',
    method: 'get',
    url: PUBLIC_BRANDING_URL,
    limit: 60,
    successStatus: 200,
    build: (server) =>
      request(server as never)
        .get(PUBLIC_BRANDING_URL)
        .set('User-Agent', 'rate-limit-ca1'),
  },
  {
    name: 'POST /tenants/me/branding/assets (10, usuario)',
    method: 'post',
    url: '/api/v1/tenants/me/branding/assets',
    limit: 10,
    successStatus: 201,
    build: (server) =>
      request(server as never)
        .post('/api/v1/tenants/me/branding/assets')
        .set('Authorization', TENANT_USER_1)
        .field('usage', 'logo')
        .field('themeVariant', 'light')
        .attach('file', PNG, { filename: 'logo.png', contentType: 'image/png' })
        .set('User-Agent', 'rate-limit-ca1'),
  },
  {
    name: 'POST /tenants (10, plataforma)',
    method: 'post',
    url: '/api/v1/tenants',
    limit: 10,
    successStatus: 201,
    build: (server) =>
      request(server as never)
        .post('/api/v1/tenants')
        .set('Authorization', PLATFORM_ADMIN)
        .send({
          name: 'ISP Rate Limit Test',
          slug: 'isp-rate-limit-test',
          contactEmail: 'contacto@isp-rate-limit.test',
          adminEmail: 'admin@isp-rate-limit.test',
        })
        .set('User-Agent', 'rate-limit-ca1'),
  },
  {
    name: 'POST /tenants/:id/branding/assets (10, plataforma)',
    method: 'post',
    url: `/api/v1/tenants/${TENANT_UUID}/branding/assets`,
    limit: 10,
    successStatus: 201,
    build: (server) =>
      request(server as never)
        .post(`/api/v1/tenants/${TENANT_UUID}/branding/assets`)
        .set('Authorization', PLATFORM_ADMIN)
        .field('usage', 'logo')
        .field('themeVariant', 'light')
        .attach('file', PNG, { filename: 'logo.png', contentType: 'image/png' })
        .set('User-Agent', 'rate-limit-ca1'),
  },
  {
    name: 'GET /platform/branding/public (60, IP)',
    method: 'get',
    url: '/api/v1/platform/branding/public',
    limit: 60,
    successStatus: 200,
    build: (server) =>
      request(server as never)
        .get('/api/v1/platform/branding/public')
        .set('User-Agent', 'rate-limit-ca1'),
  },
  {
    name: 'POST /platform/branding/assets (10, plataforma)',
    method: 'post',
    url: '/api/v1/platform/branding/assets',
    limit: 10,
    successStatus: 201,
    build: (server) =>
      request(server as never)
        .post('/api/v1/platform/branding/assets')
        .set('Authorization', PLATFORM_ADMIN)
        .field('usage', 'logo')
        .field('themeVariant', 'light')
        .attach('file', PNG, { filename: 'logo.png', contentType: 'image/png' })
        .set('User-Agent', 'rate-limit-ca1'),
  },
];

describe('CA-1 — Cada ruta de §2 responde 429 al superar su limite (ThrottlerGuard real)', () => {
  it.each(routeCases)(
    '$name',
    async (routeCase) => {
      const app = await buildApp();
      try {
        const server = app.getHttpServer();
        for (let i = 0; i < routeCase.limit; i += 1) {
          const res = await routeCase.build(server);
          expect(res.status).toBe(routeCase.successStatus);
        }
        const blocked = await routeCase.build(server);
        expect(blocked.status).toBe(429);
      } finally {
        await app.close();
      }
    },
    60000,
  );
});

describe('CA-2 — login (30) y platform/login (5) responden 429 en el valor aprobado (G0)', () => {
  it('POST /auth/login responde 429 en la 31ª solicitud por IP', async () => {
    const app = await buildApp();
    try {
      const server = app.getHttpServer();
      for (let i = 0; i < 30; i += 1) {
        await request(server as never)
          .post('/api/v1/auth/login')
          .send({ email: 'usuario@ejemplo.test', password: 'Passw0rd!!' })
          .expect(200);
      }
      await request(server as never)
        .post('/api/v1/auth/login')
        .send({ email: 'usuario@ejemplo.test', password: 'Passw0rd!!' })
        .expect(429);
    } finally {
      await app.close();
    }
  }, 60000);

  it('POST /auth/platform/login responde 429 en la 6ª solicitud por IP', async () => {
    const app = await buildApp();
    try {
      const server = app.getHttpServer();
      for (let i = 0; i < 5; i += 1) {
        await request(server as never)
          .post('/api/v1/auth/platform/login')
          .send({ email: 'admin@ejemplo.test', password: 'Passw0rd!!' })
          .expect(200);
      }
      await request(server as never)
        .post('/api/v1/auth/platform/login')
        .send({ email: 'admin@ejemplo.test', password: 'Passw0rd!!' })
        .expect(429);
    } finally {
      await app.close();
    }
  }, 60000);
});

describe('CA-3 — Una segunda IP no comparte bucket en rutas públicas', () => {
  it('agotada la IP 203.0.113.10 en public-branding, la IP 203.0.113.11 sigue en 200', async () => {
    const app = await buildApp();
    try {
      const server = app.getHttpServer();
      for (let i = 0; i < 60; i += 1) {
        await request(server as never)
          .get(PUBLIC_BRANDING_URL)
          .set('X-Forwarded-For', '203.0.113.10')
          .expect(200);
      }
      await request(server as never)
        .get(PUBLIC_BRANDING_URL)
        .set('X-Forwarded-For', '203.0.113.10')
        .expect(429);
      // La segunda IP tiene bucket propio: no hereda el bloqueo de la primera.
      await request(server as never)
        .get(PUBLIC_BRANDING_URL)
        .set('X-Forwarded-For', '203.0.113.11')
        .expect(200);
    } finally {
      await app.close();
    }
  }, 60000);
});

describe('CA-4 — Dos usuarios no comparten bucket en rutas autenticadas', () => {
  it('agotado el usuario 1 en change-password, el usuario 2 sigue en 200', async () => {
    const app = await buildApp();
    try {
      const server = app.getHttpServer();
      const body = { currentPassword: 'OldPassw0rd!', newPassword: 'NewPassw0rd!' };
      for (let i = 0; i < 10; i += 1) {
        await request(server as never)
          .post('/api/v1/auth/change-password')
          .set('Authorization', TENANT_USER_1)
          .send(body)
          .expect(200);
      }
      await request(server as never)
        .post('/api/v1/auth/change-password')
        .set('Authorization', TENANT_USER_1)
        .send(body)
        .expect(429);
      // El segundo usuario del mismo tenant tiene bucket por `sub` propio.
      await request(server as never)
        .post('/api/v1/auth/change-password')
        .set('Authorization', 'Bearer tenant-user-2')
        .send(body)
        .expect(200);
    } finally {
      await app.close();
    }
  }, 60000);
});
