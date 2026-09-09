import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';
import { JwtPayload } from './interfaces/jwt-payload.interface';

// El controlador solo necesita el token/clase AuthService para inyeccion.
// Mockear el modulo evita cargar auth.service.ts y su dependencia otplib@13.
jest.mock('./auth.service', () => ({
  AuthService: class AuthService {},
}));

jest.mock('./guards/jwt-auth.guard', () => ({
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

      if (authHeader !== 'Bearer test-access-token') {
        throw new UnauthorizedException('Token de acceso invalido o expirado.');
      }

      request.user = {
        sub: 'user-uuid-1',
        email: 'hash-email-123',
        role: 'tenant_admin',
        tenantId: 'tenant-test-uuid',
        schemaName: 'tenant_test',
        jti: 'jti-http-test',
        type: 'tenant',
        exp: Math.floor(Date.now() / 1000) + 900,
      };

      return true;
    }
  },
}));

describe('AuthController HTTP', () => {
  let app: INestApplication;

  const mockAuthService = {
    login: jest.fn(),
    loginPlatform: jest.fn(),
    refreshTokens: jest.fn(),
    refreshPlatformTokens: jest.fn(),
    logout: jest.fn(),
    setupMfa: jest.fn(),
    verifyMfaSetup: jest.fn(),
    disableMfa: jest.fn(),
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
    changePassword: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          // El controlador lee de aqui los TTL de sesion para el maxAge de las
          // cookies; sin valor configurado responde con el default (15m / 7d).
          provide: ConfigService,
          useValue: {
            get: jest
              .fn()
              .mockImplementation((key: string, defaultValue?: unknown) => defaultValue),
          },
        },
        JwtAuthGuard,
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

    // El controlador lee la cookie httpOnly del refresh token desde req.cookies.
    app.use(require('cookie-parser')());

    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('expone POST /api/v1/auth/login y emite cookie httpOnly cuando el login es completo', async () => {
    mockAuthService.login.mockResolvedValue({
      accessToken: 'jwt-access-1',
      refreshToken: 'refresh-token-1',
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('User-Agent', 'jest-supertest')
      .send({
        email: 'user@example.com',
        password: 'Passw0rd!!',
      })
      .expect(200);

    expect(response.body).toEqual({
      data: {
        accessToken: 'jwt-access-1',
      },
    });
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('refreshToken=refresh-token-1')]),
    );
    expect(mockAuthService.login).toHaveBeenCalledWith(
      { email: 'user@example.com', password: 'Passw0rd!!' },
      expect.any(String),
      'jest-supertest',
    );
  });

  it('expone POST /api/v1/auth/login y no emite cookie si MFA aun no fue completado', async () => {
    mockAuthService.login.mockResolvedValue({
      accessToken: '',
      mfaRequired: true,
      refreshToken: '',
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'user@example.com',
        password: 'Passw0rd!!',
      })
      .expect(200);

    expect(response.body).toEqual({
      data: {
        accessToken: '',
        mfaRequired: true,
      },
    });
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('rechaza POST /api/v1/auth/login con body invalido via ValidationPipe', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'correo-invalido',
        password: 'short',
      })
      .expect(400);

    expect(mockAuthService.login).not.toHaveBeenCalled();
  });

  it('expone POST /api/v1/auth/refresh y rota la cookie cuando llega refresh token', async () => {
    mockAuthService.refreshTokens.mockResolvedValue({
      accessToken: 'jwt-access-2',
      refreshToken: 'refresh-token-2',
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', ['refreshToken=refresh-token-1'])
      .set('User-Agent', 'jest-supertest-refresh')
      .expect(200);

    expect(response.body).toEqual({
      data: {
        accessToken: 'jwt-access-2',
      },
    });
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('refreshToken=refresh-token-2')]),
    );
    expect(mockAuthService.refreshTokens).toHaveBeenCalledWith(
      'refresh-token-1',
      expect.any(String),
      'jest-supertest-refresh',
    );
  });

  it('responde 401 en POST /api/v1/auth/refresh cuando no llega la cookie de refresh token', async () => {
    const response = await request(app.getHttpServer()).post('/api/v1/auth/refresh').expect(401);

    expect(response.body.message).toBe('No se encontro el refresh token.');
    expect(mockAuthService.refreshTokens).not.toHaveBeenCalled();
  });

  it('protege POST /api/v1/auth/logout y devuelve 401 sin Bearer token', async () => {
    await request(app.getHttpServer()).post('/api/v1/auth/logout').expect(401);

    expect(mockAuthService.logout).not.toHaveBeenCalled();
  });

  it('expone POST /api/v1/auth/logout, revoca sesion y limpia la cookie', async () => {
    mockAuthService.logout.mockResolvedValue(undefined);

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', 'Bearer test-access-token')
      .set('Cookie', ['refreshToken=refresh-token-9'])
      .expect(200);

    expect(response.body).toEqual({
      data: {
        message: 'Sesion cerrada correctamente.',
      },
    });
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('refreshToken=;')]),
    );
    expect(mockAuthService.logout).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'user-uuid-1', jti: 'jti-http-test' }),
      'refresh-token-9',
      undefined,
    );
  });

  it('expone GET /api/v1/auth/me y retorna el payload autenticado', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer test-access-token')
      .expect(200);

    expect(response.body).toEqual({
      data: expect.objectContaining({
        sub: 'user-uuid-1',
        tenantId: 'tenant-test-uuid',
        schemaName: 'tenant_test',
      }),
    });
  });

  it('expone POST /api/v1/auth/mfa/setup y retorna el QR para el authenticator', async () => {
    mockAuthService.setupMfa.mockResolvedValue({
      qrCodeBase64: 'data:image/png;base64,AAA',
      otpauthUri: 'otpauth://totp/iWana:user@example.com',
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/mfa/setup')
      .set('Authorization', 'Bearer test-access-token')
      .expect(200);

    expect(response.body).toEqual({
      data: {
        qrCodeBase64: 'data:image/png;base64,AAA',
        otpauthUri: 'otpauth://totp/iWana:user@example.com',
      },
    });
    expect(mockAuthService.setupMfa).toHaveBeenCalledWith('user-uuid-1', 'hash-email-123');
  });

  it('valida POST /api/v1/auth/mfa/verify antes de invocar el servicio', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/mfa/verify')
      .set('Authorization', 'Bearer test-access-token')
      .send({ totpCode: '123' })
      .expect(400);

    expect(mockAuthService.verifyMfaSetup).not.toHaveBeenCalled();
  });

  it('expone POST /api/v1/auth/change-password y confirma el cambio', async () => {
    mockAuthService.changePassword.mockResolvedValue(undefined);

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/change-password')
      .set('Authorization', 'Bearer test-access-token')
      .send({
        currentPassword: 'OldPassw0rd!',
        newPassword: 'NewPassw0rd!',
      })
      .expect(200);

    expect(response.body).toEqual({
      data: {
        message: 'Contrasena actualizada correctamente.',
      },
    });
    // El servicio recibe el payload completo, no solo el sub: necesita `type`
    // para no resolver a un usuario de plataforma via TenantContext, y `jti`
    // para revocar el token de alcance limitado al completar el cambio.
    expect(mockAuthService.changePassword).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'user-uuid-1', type: 'tenant', jti: 'jti-http-test' }),
      { currentPassword: 'OldPassw0rd!', newPassword: 'NewPassw0rd!' },
    );
  });

  it('P-05: POST /api/v1/auth/change-password limpia la cookie de access', async () => {
    mockAuthService.changePassword.mockResolvedValue(undefined);

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/change-password')
      .set('Authorization', 'Bearer test-access-token')
      .send({
        currentPassword: 'OldPassw0rd!',
        newPassword: 'NewPassw0rd!',
      })
      .expect(200);

    const setCookie = response.headers['set-cookie'] as unknown;
    expect(setCookie).toBeDefined();
    const cookies = Array.isArray(setCookie) ? setCookie.join(';') : String(setCookie);
    expect(cookies).toContain('portalAccessToken=;');
  });

  // ---------------------------------------------------------------------------
  // MOD01 — primer ingreso: contrato HTTP del indicador de cambio forzado
  //
  // A nivel de servicio el indicador puede estar perfectamente calculado y aun
  // asi no llegar al cliente: NestJS descarta los campos omitidos al serializar.
  // Es la misma causa por la que `mfaRequired` / `mfaSetupRequired` tuvieron que
  // propagarse a mano. Si este contrato se rompe, el usuario entra sin cambiar
  // nada mientras el backend cree que se lo exigio, y ningun test de servicio lo
  // detecta. Por eso se verifica sobre la respuesta HTTP real.
  // ---------------------------------------------------------------------------

  describe('POST /api/v1/auth/platform/login — indicador de cambio forzado', () => {
    it('serializa passwordResetRequired=true en el cuerpo de la respuesta', async () => {
      mockAuthService.loginPlatform.mockResolvedValue({
        accessToken: 'jwt-scoped-1',
        passwordResetRequired: true,
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/platform/login')
        .send({ email: 'admin@example.test', password: 'Passw0rd!!' })
        .expect(200);

      expect(response.body).toEqual({
        data: {
          accessToken: 'jwt-scoped-1',
          passwordResetRequired: true,
        },
      });
    });

    it('no emite cookie de refresh en el primer ingreso forzado', async () => {
      // El token entregado es de alcance limitado: no debe venir acompanado de
      // una sesion renovable que sobreviva al cambio de contrasena.
      mockAuthService.loginPlatform.mockResolvedValue({
        accessToken: 'jwt-scoped-2',
        passwordResetRequired: true,
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/platform/login')
        .send({ email: 'admin@example.test', password: 'Passw0rd!!' })
        .expect(200);

      expect(response.headers['set-cookie']).toBeUndefined();
    });

    it('omite el indicador cuando la cuenta ya cambio su contrasena', async () => {
      mockAuthService.loginPlatform.mockResolvedValue({ accessToken: 'jwt-full-1' });

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/platform/login')
        .send({ email: 'admin@example.test', password: 'Passw0rd!!' })
        .expect(200);

      expect(response.body).toEqual({ data: { accessToken: 'jwt-full-1' } });
      expect(response.body.data.passwordResetRequired).toBeUndefined();
    });

    it('sigue propagando mfaRequired cuando el MFA es el paso pendiente', async () => {
      mockAuthService.loginPlatform.mockResolvedValue({ accessToken: '', mfaRequired: true });

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/platform/login')
        .send({ email: 'admin@example.test', password: 'Passw0rd!!' })
        .expect(200);

      expect(response.body).toEqual({ data: { accessToken: '', mfaRequired: true } });
    });

    it('emite las cookies de access y refresh en el login completo (C-6)', async () => {
      mockAuthService.loginPlatform.mockResolvedValue({
        accessToken: 'jwt-platform-1',
        refreshToken: 'platform-refresh-1',
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/platform/login')
        .set('User-Agent', 'jest-supertest-platform')
        .send({ email: 'admin@example.test', password: 'Passw0rd!!' })
        .expect(200);

      expect(response.body).toEqual({ data: { accessToken: 'jwt-platform-1' } });
      expect(response.headers['set-cookie']).toEqual(
        expect.arrayContaining([
          expect.stringContaining('webAccessToken=jwt-platform-1'),
          expect.stringContaining('webRefreshToken=platform-refresh-1'),
        ]),
      );
      expect(mockAuthService.loginPlatform).toHaveBeenCalledWith(
        { email: 'admin@example.test', password: 'Passw0rd!!' },
        expect.any(String),
        'jest-supertest-platform',
      );
    });

    it('rota la sesion de consola cuando refresh llega con la cookie de plataforma (C-6)', async () => {
      mockAuthService.refreshPlatformTokens.mockResolvedValue({
        accessToken: 'jwt-platform-2',
        refreshToken: 'platform-refresh-2',
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', ['webRefreshToken=platform-refresh-1'])
        .set('User-Agent', 'jest-supertest-platform-refresh')
        .expect(200);

      expect(response.body).toEqual({ data: { accessToken: 'jwt-platform-2' } });
      expect(response.headers['set-cookie']).toEqual(
        expect.arrayContaining([
          expect.stringContaining('webAccessToken=jwt-platform-2'),
          expect.stringContaining('webRefreshToken=platform-refresh-2'),
        ]),
      );
      expect(mockAuthService.refreshPlatformTokens).toHaveBeenCalledWith(
        'platform-refresh-1',
        expect.any(String),
        'jest-supertest-platform-refresh',
      );
      expect(mockAuthService.refreshTokens).not.toHaveBeenCalled();
    });
  });
});
