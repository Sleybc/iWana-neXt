import { INestApplication, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { TenantContext } from '@iwana/db';
import { TenantStatus } from '@iwana/shared';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AuthController } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { PlatformLoginThrottle } from '../auth/platform-login-throttle.service';
import {
  platformRefreshCookieName,
  tenantRefreshCookieName,
} from '../auth/session-cookies.constants';
import { TenantMiddleware } from './tenant.middleware';
import { TenantService } from './tenant.service';

// El controlador solo necesita la clase AuthService como token de inyección.
jest.mock('../auth/auth.service', () => ({ AuthService: class AuthService {} }));

/**
 * V-2 (PROMPT-WEB-DASHBOARD-OLA2-v1.0 §A): `POST /auth/refresh` con el TenantMiddleware
 * montado, como en `AppModule`. Sin ninguna cookie de refresh responde 401 desde el
 * controlador; el refresh de tenant con slug y el de plataforma con cookie no cambian.
 */
describe('TenantMiddleware + POST /auth/refresh (HTTP)', () => {
  let app: INestApplication;

  const authService = {
    refreshTokens: jest.fn(),
    refreshPlatformTokens: jest.fn(),
  };
  const tenantService = {
    findById: jest.fn(),
    findBySlug: jest.fn(),
  };

  beforeAll(async () => {
    @Module({
      controllers: [AuthController],
      providers: [
        TenantMiddleware,
        {
          provide: PlatformLoginThrottle,
          useValue: { reserve: async () => ({ release: async () => undefined }) },
        },
        { provide: AuthService, useValue: authService },
        { provide: TenantService, useValue: tenantService },
        {
          provide: JwtService,
          useValue: {
            verify: jest.fn(() => {
              throw new Error('sin token');
            }),
          },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn((_key: string, defaultValue?: unknown) => defaultValue) },
        },
      ],
    })
    class RefreshProbeModule implements NestModule {
      configure(consumer: MiddlewareConsumer): void {
        consumer.apply(TenantMiddleware).forRoutes('*path');
      }
    }

    const moduleRef = await Test.createTestingModule({ imports: [RefreshProbeModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('sin cookie de refresh ni X-Tenant-Slug responde 401 (no 400)', async () => {
    const response = await request(app.getHttpServer()).post('/api/v1/auth/refresh').expect(401);

    expect(response.body.message).toBe('No se encontro el refresh token.');
    expect(authService.refreshTokens).not.toHaveBeenCalled();
    expect(authService.refreshPlatformTokens).not.toHaveBeenCalled();
    expect(tenantService.findBySlug).not.toHaveBeenCalled();
  });

  it('el refresh de tenant con X-Tenant-Slug y cookie de tenant sigue rotando la sesión', async () => {
    tenantService.findBySlug.mockResolvedValue({
      id: 'tenant-uuid-1',
      slug: 'empresa-prueba',
      schemaName: 'tenant_empresa_prueba',
      status: TenantStatus.ACTIVE,
    });
    authService.refreshTokens.mockResolvedValue({
      accessToken: 'access-tenant-2',
      refreshToken: 'refresh-tenant-2',
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('X-Tenant-Slug', 'empresa-prueba')
      .set('Cookie', [`${tenantRefreshCookieName()}=refresh-tenant-1`])
      .expect(200);

    expect(response.body).toEqual({ data: { accessToken: 'access-tenant-2' } });
    expect(tenantService.findBySlug).toHaveBeenCalledWith('empresa-prueba');
    expect(authService.refreshTokens).toHaveBeenCalledWith(
      'refresh-tenant-1',
      expect.anything(),
      undefined,
    );
  });

  it('la cookie de tenant sin X-Tenant-Slug sigue exigiendo la cabecera (400)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', [`${tenantRefreshCookieName()}=refresh-tenant-1`])
      .expect(400);

    expect(authService.refreshTokens).not.toHaveBeenCalled();
  });

  it('el refresh de plataforma con su cookie sigue sin exigir X-Tenant-Slug', async () => {
    authService.refreshPlatformTokens.mockResolvedValue({
      accessToken: 'access-platform-2',
      refreshToken: 'refresh-platform-2',
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', [`${platformRefreshCookieName()}=refresh-platform-1`])
      .expect(200);

    expect(response.body).toEqual({ data: { accessToken: 'access-platform-2' } });
    expect(authService.refreshPlatformTokens).toHaveBeenCalledWith(
      'refresh-platform-1',
      expect.anything(),
      undefined,
    );
    expect(tenantService.findBySlug).not.toHaveBeenCalled();
  });

  describe('portal en producción con ambas cookies y sin audiencia', () => {
    const original = process.env['NODE_ENV'];
    beforeEach(() => {
      process.env['NODE_ENV'] = 'production';
      // Como el servicio real: sin contexto de empresa, revienta.
      authService.refreshTokens.mockImplementation(() =>
        Promise.resolve(TenantContext.getOrThrow()).then(() => ({
          accessToken: 'access-tenant-2',
          refreshToken: 'refresh-tenant-2',
        })),
      );
    });
    afterEach(() => {
      process.env['NODE_ENV'] = original;
    });

    const refresh = (surface: string) =>
      request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('X-Iwana-Surface', surface)
        .set('Cookie', [
          `${tenantRefreshCookieName()}=refresh-tenant-1`,
          `${platformRefreshCookieName()}=refresh-platform-1`,
        ]);

    it('sin slug responde 400: la cookie de plataforma no exime', async () => {
      await refresh('portal').expect(400);
      expect(authService.refreshTokens).not.toHaveBeenCalled();
      expect(authService.refreshPlatformTokens).not.toHaveBeenCalled();
    });

    it('con slug renueva la empresa y no toca la sesión de plataforma', async () => {
      tenantService.findBySlug.mockResolvedValue({
        id: 'tenant-uuid-1',
        slug: 'empresa-prueba',
        schemaName: 'tenant_empresa_prueba',
        status: TenantStatus.ACTIVE,
      });
      const response = await refresh('portal').set('X-Tenant-Slug', 'empresa-prueba').expect(200);
      expect(response.body).toEqual({ data: { accessToken: 'access-tenant-2' } });
      expect(authService.refreshTokens).toHaveBeenCalledTimes(1);
      expect(authService.refreshPlatformTokens).not.toHaveBeenCalled();
      expect(String(response.headers['set-cookie'])).not.toContain(platformRefreshCookieName());
    });

    it('en la consola la cookie de plataforma sigue eximiendo', async () => {
      authService.refreshPlatformTokens.mockResolvedValue({
        accessToken: 'access-platform-2',
        refreshToken: 'refresh-platform-2',
      });
      await refresh('console').expect(200);
      expect(authService.refreshTokens).not.toHaveBeenCalled();
    });
  });
});
