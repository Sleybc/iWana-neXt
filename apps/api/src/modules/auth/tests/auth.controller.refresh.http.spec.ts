import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

// El controlador solo necesita el token/clase AuthService para inyeccion.
// Mockear el modulo evita cargar auth.service.ts y su dependencia otplib@13.
jest.mock('../auth.service', () => ({
  AuthService: class AuthService {},
}));

// Todas las rutas probadas aqui son @Public(): el guard real no aporta nada y
// exigiria JWT. Se sustituye por uno que siempre deja pasar.
jest.mock('../guards/jwt-auth.guard', () => ({
  JwtAuthGuard: class JwtAuthGuard {
    canActivate(): boolean {
      return true;
    }
  },
}));

import { AuthController } from '../auth.controller';
import { AuthService } from '../auth.service';

/**
 * Ruteo por audiencia del POST /auth/refresh (fail-fast por audiencia).
 *
 * El portal declara audiencia tenant SIEMPRE via `X-Tenant-Slug`; la consola
 * de plataforma NUNCA la envia. Con audiencia tenant declarada el endpoint es
 * fail-fast: solo intenta la rama tenant y responde 401 inmediato si la cookie
 * tenant falta o es rechazada (la cookie de plataforma presente se ignora sin
 * consumirla — una sesion de plataforma jamas autoriza al portal, asi que el
 * fallback seria un ciclo desperdiciado). Sin header se conserva
 * platform-first con fallback a tenant por retrocompatibilidad.
 *
 * La deteccion de reuse vive en AuthService y no se toca aqui.
 */

const mockAuthService = {
  refreshTokens: jest.fn(),
  refreshPlatformTokens: jest.fn(),
};

/** TTLs de sesion leidos por el controlador para el maxAge de las cookies. */
const configValues: Record<string, string | undefined> = {
  JWT_ACCESS_EXPIRATION: '15m',
  JWT_REFRESH_EXPIRATION: '7d',
};

/** Extrae el array Set-Cookie crudo de una respuesta de supertest. */
function setCookies(response: request.Response): string[] {
  const raw = response.headers['set-cookie'] as unknown;
  if (Array.isArray(raw)) {
    return raw.map(String);
  }
  return typeof raw === 'string' ? [raw] : [];
}

/** Devuelve la cookie cuyo nombre coincide, o undefined si no fue emitida. */
function findCookie(cookies: string[], name: string): string | undefined {
  return cookies.find((cookie) => cookie.startsWith(`${name}=`));
}

describe('AuthController POST /auth/refresh — ruteo por audiencia (fail-fast) y fallback sin declaracion', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest
              .fn()
              .mockImplementation(
                (key: string, defaultValue?: unknown) => configValues[key] ?? defaultValue,
              ),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(require('cookie-parser')());
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    configValues['JWT_ACCESS_EXPIRATION'] = '15m';
    configValues['JWT_REFRESH_EXPIRATION'] = '7d';
  });

  afterAll(async () => {
    await app?.close();
  });

  it('ambas cookies + X-Tenant-Slug: rota la sesion del portal y solo emite sus cookies', async () => {
    mockAuthService.refreshTokens.mockResolvedValue({
      accessToken: 'jwt-tenant-1',
      refreshToken: 'tenant-refresh-2',
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', ['refreshToken=tenant-refresh-1', 'webRefreshToken=platform-refresh-1'])
      .set('X-Tenant-Slug', 'tenant-demo')
      .set('User-Agent', 'jest-portal')
      .expect(200);

    expect(response.body).toEqual({ data: { accessToken: 'jwt-tenant-1' } });
    expect(mockAuthService.refreshTokens).toHaveBeenCalledWith(
      'tenant-refresh-1',
      expect.any(String),
      'jest-portal',
    );
    expect(mockAuthService.refreshPlatformTokens).not.toHaveBeenCalled();

    const cookies = setCookies(response);
    expect(findCookie(cookies, 'refreshToken')).toContain('refreshToken=tenant-refresh-2');
    expect(findCookie(cookies, 'portalAccessToken')).toContain('portalAccessToken=jwt-tenant-1');
    expect(findCookie(cookies, 'webRefreshToken')).toBeUndefined();
    expect(findCookie(cookies, 'webAccessToken')).toBeUndefined();
  });

  it('ambas cookies sin X-Tenant-Slug: intenta primero la rama de plataforma', async () => {
    mockAuthService.refreshPlatformTokens.mockResolvedValue({
      accessToken: 'jwt-platform-1',
      refreshToken: 'platform-refresh-2',
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', ['refreshToken=tenant-refresh-1', 'webRefreshToken=platform-refresh-1'])
      .set('User-Agent', 'jest-console')
      .expect(200);

    expect(response.body).toEqual({ data: { accessToken: 'jwt-platform-1' } });
    expect(mockAuthService.refreshPlatformTokens).toHaveBeenCalledWith(
      'platform-refresh-1',
      expect.any(String),
      'jest-console',
    );
    expect(mockAuthService.refreshTokens).not.toHaveBeenCalled();
    expect(findCookie(setCookies(response), 'webRefreshToken')).toContain(
      'webRefreshToken=platform-refresh-2',
    );
  });

  it('sin header y solo cookie de plataforma: rama plataforma directa sin fallback', async () => {
    mockAuthService.refreshPlatformTokens.mockResolvedValue({
      accessToken: 'jwt-platform-4',
      refreshToken: 'platform-refresh-5',
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', ['webRefreshToken=platform-refresh-1'])
      .expect(200);

    expect(response.body).toEqual({ data: { accessToken: 'jwt-platform-4' } });
    expect(mockAuthService.refreshPlatformTokens).toHaveBeenCalledTimes(1);
    expect(mockAuthService.refreshTokens).not.toHaveBeenCalled();
    expect(findCookie(setCookies(response), 'webRefreshToken')).toContain(
      'webRefreshToken=platform-refresh-5',
    );
  });

  it('sin header con ambas credenciales rechazadas relanza el error primario de plataforma', async () => {
    mockAuthService.refreshPlatformTokens.mockRejectedValue(
      new UnauthorizedException('Refresh token invalido.'),
    );
    mockAuthService.refreshTokens.mockRejectedValue(
      new UnauthorizedException(
        'Sesion invalida detectada. Se cerraron todas las sesiones activas.',
      ),
    );

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', ['refreshToken=tenant-refresh-1', 'webRefreshToken=platform-refresh-1'])
      .expect(401);

    // Sin audiencia declarada la credencial prioritaria es la de plataforma:
    // si ambas son rechazadas manda su error, no el del fallback.
    expect(response.body.statusCode).toBe(401);
    expect(response.body.message).toBe('Refresh token invalido.');
    expect(mockAuthService.refreshPlatformTokens).toHaveBeenCalledTimes(1);
    expect(mockAuthService.refreshTokens).toHaveBeenCalledTimes(1);
  });

  it('fail-fast con audiencia tenant: tenant rechazada con 401 responde 401 sin intentar la plataforma', async () => {
    mockAuthService.refreshTokens.mockRejectedValue(
      new UnauthorizedException('Refresh token invalido.'),
    );

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', ['refreshToken=tenant-refresh-1', 'webRefreshToken=platform-refresh-1'])
      .set('X-Tenant-Slug', 'tenant-demo')
      .expect(401);

    expect(response.body.message).toBe('Refresh token invalido.');
    expect(mockAuthService.refreshTokens).toHaveBeenCalledTimes(1);
    // La cookie de plataforma presente se ignora sin consumirla.
    expect(mockAuthService.refreshPlatformTokens).not.toHaveBeenCalled();
    expect(setCookies(response)).toEqual([]);
  });

  it('X-Tenant-Slug duplicado tambien declara audiencia tenant: fail-fast', async () => {
    // El parser HTTP une cabeceras duplicadas con coma; el valor sigue siendo
    // no vacio y declara audiencia tenant (la normalizacion Array.isArray del
    // controlador cubre ademas el caso defensivo de `string[]`).
    mockAuthService.refreshTokens.mockRejectedValue(
      new UnauthorizedException('Refresh token invalido.'),
    );

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', ['refreshToken=tenant-refresh-1', 'webRefreshToken=platform-refresh-1'])
      .set('X-Tenant-Slug', 'tenant-demo, tenant-otro')
      .expect(401);

    expect(response.body.message).toBe('Refresh token invalido.');
    expect(mockAuthService.refreshTokens).toHaveBeenCalledTimes(1);
    expect(mockAuthService.refreshPlatformTokens).not.toHaveBeenCalled();
  });

  it('fail-fast con audiencia tenant y solo cookie de plataforma: 401 sin invocar ninguna rama util', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', ['webRefreshToken=platform-refresh-1'])
      .set('X-Tenant-Slug', 'tenant-demo')
      .expect(401);

    expect(response.body.message).toBe('No se encontro el refresh token.');
    expect(mockAuthService.refreshTokens).not.toHaveBeenCalled();
    expect(mockAuthService.refreshPlatformTokens).not.toHaveBeenCalled();
    expect(setCookies(response)).toEqual([]);
  });

  it('fallback tenant: plataforma rechazada con 401 sin header intenta la rama del portal', async () => {
    mockAuthService.refreshPlatformTokens.mockRejectedValue(
      new UnauthorizedException('Refresh token invalido.'),
    );
    mockAuthService.refreshTokens.mockResolvedValue({
      accessToken: 'jwt-tenant-2',
      refreshToken: 'tenant-refresh-3',
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', ['refreshToken=tenant-refresh-1', 'webRefreshToken=platform-refresh-1'])
      .expect(200);

    expect(response.body).toEqual({ data: { accessToken: 'jwt-tenant-2' } });
    expect(mockAuthService.refreshPlatformTokens).toHaveBeenCalledTimes(1);
    expect(mockAuthService.refreshTokens).toHaveBeenCalledTimes(1);
    expect(findCookie(setCookies(response), 'refreshToken')).toContain(
      'refreshToken=tenant-refresh-3',
    );
  });

  it('reuse detection en la rama tenant con audiencia declarada responde 401 sin intentar la plataforma', async () => {
    // El servicio ya revoco la familia (REUSE_ATTACK) y responde 401; el
    // controlador fail-fast lo propaga de inmediato sin probar la plataforma.
    mockAuthService.refreshTokens.mockRejectedValue(
      new UnauthorizedException(
        'Sesion invalida detectada. Se cerraron todas las sesiones activas.',
      ),
    );

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', ['refreshToken=tenant-refresh-1', 'webRefreshToken=platform-refresh-1'])
      .set('X-Tenant-Slug', 'tenant-demo')
      .expect(401);

    expect(response.body.message).toBe(
      'Sesion invalida detectada. Se cerraron todas las sesiones activas.',
    );
    expect(mockAuthService.refreshTokens).toHaveBeenCalledTimes(1);
    expect(mockAuthService.refreshPlatformTokens).not.toHaveBeenCalled();
  });

  it('con audiencia tenant declarada solo se intenta la rama tenant aunque ambas fallen', async () => {
    mockAuthService.refreshTokens.mockRejectedValue(
      new UnauthorizedException(
        'Sesion invalida detectada. Se cerraron todas las sesiones activas.',
      ),
    );
    mockAuthService.refreshPlatformTokens.mockRejectedValue(
      new UnauthorizedException('Refresh token invalido.'),
    );

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', ['refreshToken=tenant-refresh-1', 'webRefreshToken=platform-refresh-1'])
      .set('X-Tenant-Slug', 'tenant-demo')
      .expect(401);

    // El cuerpo conserva el contrato { statusCode, message } con el mensaje de
    // la rama tenant: es la unica que se intento.
    expect(response.body.statusCode).toBe(401);
    expect(response.body.message).toBe(
      'Sesion invalida detectada. Se cerraron todas las sesiones activas.',
    );
    expect(mockAuthService.refreshTokens).toHaveBeenCalledTimes(1);
    expect(mockAuthService.refreshPlatformTokens).not.toHaveBeenCalled();
  });

  it('una sola cookie de tenant: rama tenant directa sin fallback', async () => {
    mockAuthService.refreshTokens.mockResolvedValue({
      accessToken: 'jwt-tenant-4',
      refreshToken: 'tenant-refresh-5',
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', ['refreshToken=tenant-refresh-1'])
      .expect(200);

    expect(response.body).toEqual({ data: { accessToken: 'jwt-tenant-4' } });
    expect(mockAuthService.refreshTokens).toHaveBeenCalledTimes(1);
    expect(mockAuthService.refreshPlatformTokens).not.toHaveBeenCalled();
  });

  it('sin cookies responde 401 con el cuerpo de error vigente y no invoca el servicio', async () => {
    const response = await request(app.getHttpServer()).post('/api/v1/auth/refresh').expect(401);

    expect(response.body.message).toBe('No se encontro el refresh token.');
    expect(mockAuthService.refreshTokens).not.toHaveBeenCalled();
    expect(mockAuthService.refreshPlatformTokens).not.toHaveBeenCalled();
  });

  it('un fallo no-401 en la rama primaria no se enmascara ni dispara fallback', async () => {
    mockAuthService.refreshTokens.mockRejectedValue(new Error('fallo de infraestructura'));

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', ['refreshToken=tenant-refresh-1', 'webRefreshToken=platform-refresh-1'])
      .set('X-Tenant-Slug', 'tenant-demo')
      .expect(500);

    expect(mockAuthService.refreshPlatformTokens).not.toHaveBeenCalled();
  });

  it('re-emite las cookies con httpOnly, SameSite=Strict y paths del contrato', async () => {
    mockAuthService.refreshTokens.mockResolvedValue({
      accessToken: 'jwt-tenant-5',
      refreshToken: 'tenant-refresh-6',
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', ['refreshToken=tenant-refresh-1'])
      .expect(200);

    const cookies = setCookies(response);

    const refreshCookie = findCookie(cookies, 'refreshToken');
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toContain('HttpOnly');
    expect(refreshCookie).toContain('SameSite=Strict');
    expect(refreshCookie).toContain('Path=/api/v1/auth');

    const accessCookie = findCookie(cookies, 'portalAccessToken');
    expect(accessCookie).toBeDefined();
    expect(accessCookie).toContain('HttpOnly');
    expect(accessCookie).toContain('SameSite=Strict');
    expect(accessCookie).toContain('Path=/');
  });

  it('sincroniza el Max-Age de las cookies con los TTL configurados', async () => {
    configValues['JWT_ACCESS_EXPIRATION'] = '1h';
    configValues['JWT_REFRESH_EXPIRATION'] = '30d';

    mockAuthService.refreshTokens.mockResolvedValue({
      accessToken: 'jwt-tenant-6',
      refreshToken: 'tenant-refresh-7',
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', ['refreshToken=tenant-refresh-1'])
      .expect(200);

    const cookies = setCookies(response);
    expect(findCookie(cookies, 'portalAccessToken')).toContain('Max-Age=3600');
    expect(findCookie(cookies, 'refreshToken')).toContain('Max-Age=2592000');
  });
});
