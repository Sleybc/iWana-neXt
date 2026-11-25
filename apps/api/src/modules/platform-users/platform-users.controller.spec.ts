import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PlatformRole } from '@iwana/shared';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PlatformUsersController } from './platform-users.controller';
import { PlatformUsersService } from './platform-users.service';

jest.mock('../auth/auth.service', () => ({
  AuthService: class AuthService {
    signPlatformEnrollmentToken(): string {
      return 'mock-platform-access-token';
    }
  },
}));

jest.mock('../auth/guards/jwt-auth.guard', () => ({
  JwtAuthGuard: class JwtAuthGuard {
    canActivate(context: {
      switchToHttp: () => {
        getRequest: () => {
          headers: Record<string, string | undefined>;
          user?: Record<string, unknown>;
        };
      };
    }): boolean {
      const req = context.switchToHttp().getRequest();
      const isSupport = req.headers.authorization === 'Bearer test-support-token';
      if (!isSupport && req.headers.authorization !== 'Bearer test-access-token') {
        throw new UnauthorizedException('Token de acceso invalido o expirado.');
      }

      req.user = {
        sub: '2cfa4585-c2f2-49d3-8f42-1265f951a7a9',
        role: isSupport ? PlatformRole.IWANA_SUPPORT : PlatformRole.SYSTEM_ADMIN,
        email: 'hash',
        tenantId: null,
        schemaName: null,
        jti: 'jti-1',
        type: 'platform',
      };
      return true;
    }
  },
}));

describe('PlatformUsersController HTTP', () => {
  let app: INestApplication;

  const platformUsersServiceMock = {
    getProfile: jest.fn(),
    getSummary: jest.fn(),
    listDirectory: jest.fn(),
    createBootstrapUser: jest.fn(),
    createDirectoryAccount: jest.fn(),
    updateDirectoryName: jest.fn(),
    updateProfile: jest.fn(),
    changeLoginEmail: jest.fn(),
    changePassword: jest.fn(),
  };

  const authServiceMock = {
    signPlatformEnrollmentToken: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [PlatformUsersController],
      providers: [
        { provide: PlatformUsersService, useValue: platformUsersServiceMock },
        { provide: AuthService, useValue: authServiceMock },
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

  it('POST /platform-users/bootstrap solo entrega un token de inscripción', async () => {
    platformUsersServiceMock.createBootstrapUser.mockResolvedValue({ id: 'u1' });
    authServiceMock.signPlatformEnrollmentToken.mockResolvedValue('inscripcion');

    await request(app.getHttpServer())
      .post('/api/v1/platform-users/bootstrap')
      .set('Authorization', 'Bearer test-access-token')
      .send({ email: 'admin@iwana.co', password: 'Admin123!@#', confirmPassword: 'Admin123!@#' })
      .expect(201, { data: { accessToken: 'inscripcion', mfaSetupRequired: true } });
    expect(authServiceMock.signPlatformEnrollmentToken).toHaveBeenCalledWith('u1');
  });

  it('GET /platform-users/me retorna 200 con perfil', async () => {
    platformUsersServiceMock.getProfile.mockResolvedValue({
      id: 'u1',
      language: 'es-CO',
    });

    await request(app.getHttpServer())
      .get('/api/v1/platform-users/me')
      .set('Authorization', 'Bearer test-access-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.id).toBe('u1');
      });
  });

  it('GET /platform-users/summary retorna 200 envuelto en { data }', async () => {
    platformUsersServiceMock.getSummary.mockResolvedValue({
      total: 2,
      byRole: { SYSTEM_ADMIN: 1, IWANA_SUPPORT: 1 },
      withoutMfa: 0,
      withoutAccess30d: 1,
      generatedAt: '2026-11-21T12:00:00.000Z',
    });

    await request(app.getHttpServer())
      .get('/api/v1/platform-users/summary')
      .set('Authorization', 'Bearer test-access-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.total).toBe(2);
        expect(body.data.withoutAccess30d).toBe(1);
      });
    expect(platformUsersServiceMock.getSummary).toHaveBeenCalledTimes(1);
  });

  it('GET /platform-users/summary retorna 401 sin token', async () => {
    await request(app.getHttpServer()).get('/api/v1/platform-users/summary').expect(401);
    expect(platformUsersServiceMock.getSummary).not.toHaveBeenCalled();
  });

  it('GET /platform-users devuelve la página solicitada con una sesión de plataforma', async () => {
    const directory = { items: [], total: 1, pageSize: 20 };
    platformUsersServiceMock.listDirectory.mockResolvedValue(directory);

    await request(app.getHttpServer())
      .get('/api/v1/platform-users?page=2')
      .set('Authorization', 'Bearer test-access-token')
      .expect('Cache-Control', 'private, no-store')
      .expect(200, { data: directory });

    expect(platformUsersServiceMock.listDirectory).toHaveBeenCalledWith(
      2,
      expect.objectContaining({ type: 'platform' }),
      expect.any(Object),
    );
  });

  it('GET /platform-users rechaza peticiones sin sesión y páginas inválidas', async () => {
    await request(app.getHttpServer()).get('/api/v1/platform-users').expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/platform-users?page=0')
      .set('Authorization', 'Bearer test-access-token')
      .expect(400);

    expect(platformUsersServiceMock.listDirectory).not.toHaveBeenCalled();
  });

  it('GET /platform-users/me retorna 401 sin token', async () => {
    await request(app.getHttpServer()).get('/api/v1/platform-users/me').expect(401);
  });

  it('POST /platform-users exige administrador y devuelve la credencial temporal sin caché', async () => {
    const account = {
      email: 'cuenta@example.test',
      firstName: 'Cuenta',
      lastName: 'Demo',
      role: PlatformRole.IWANA_SUPPORT,
    };
    const result = { id: 'account-1', temporaryPassword: 'credencial-de-prueba' };
    platformUsersServiceMock.createDirectoryAccount.mockResolvedValue(result);

    await request(app.getHttpServer()).post('/api/v1/platform-users').send(account).expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/platform-users')
      .set('Authorization', 'Bearer test-support-token')
      .send(account)
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/platform-users')
      .set('Authorization', 'Bearer test-access-token')
      .send({ ...account, mfaEnabled: false })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/platform-users')
      .set('Authorization', 'Bearer test-access-token')
      .send(account)
      .expect('Cache-Control', 'private, no-store')
      .expect(201, { data: result });
    expect(platformUsersServiceMock.createDirectoryAccount).toHaveBeenCalledTimes(1);
  });

  it('PATCH /platform-users/:id/name permite editar solo al administrador de plataforma', async () => {
    const id = '23a9d00b-16a9-4d80-ab28-a62260b2d23e';
    const path = `/api/v1/platform-users/${id}/name`;
    const name = { firstName: 'Cuenta', lastName: 'De prueba' };

    await request(app.getHttpServer()).patch(path).send(name).expect(401);
    await request(app.getHttpServer())
      .patch(path)
      .set('Authorization', 'Bearer test-support-token')
      .send(name)
      .expect(403);
    await request(app.getHttpServer())
      .patch(path)
      .set('Authorization', 'Bearer test-access-token')
      .send({ ...name, role: PlatformRole.SYSTEM_ADMIN })
      .expect(400);
    await request(app.getHttpServer())
      .patch(path)
      .set('Authorization', 'Bearer test-access-token')
      .send(name)
      .expect(204);

    expect(platformUsersServiceMock.updateDirectoryName).toHaveBeenCalledTimes(1);
    expect(platformUsersServiceMock.updateDirectoryName).toHaveBeenCalledWith(
      id,
      name,
      '2cfa4585-c2f2-49d3-8f42-1265f951a7a9',
      expect.any(Object),
    );
  });

  it('PATCH /platform-users/me retorna 200 con cambios parciales', async () => {
    platformUsersServiceMock.updateProfile.mockResolvedValue({
      id: 'u1',
      firstName: 'Nuevo',
      lastName: 'Administrador',
      phone: '+573001112233',
      timezone: 'America/Bogota',
      language: 'es-CO',
    });

    await request(app.getHttpServer())
      .patch('/api/v1/platform-users/me')
      .set('Authorization', 'Bearer test-access-token')
      .send({ firstName: 'Nuevo' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.firstName).toBe('Nuevo');
      });
  });

  it('PATCH /platform-users/me retorna 400 con phone inválido', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/platform-users/me')
      .set('Authorization', 'Bearer test-access-token')
      .send({ phone: 'invalido' })
      .expect(400);
  });

  it('PATCH /platform-users/me/login-email retorna 200 cuando actualiza el email de acceso', async () => {
    platformUsersServiceMock.changeLoginEmail.mockResolvedValue({
      id: 'u1',
      email: 'nuevo.admin@iwana.co',
    });

    await request(app.getHttpServer())
      .patch('/api/v1/platform-users/me/login-email')
      .set('Authorization', 'Bearer test-access-token')
      .send({ email: 'nuevo.admin@iwana.co', currentPassword: 'Passw0rd!Segura' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.email).toBe('nuevo.admin@iwana.co');
      });
  });

  it('PATCH /platform-users/me/login-email retorna 400 con mensaje claro si el correo es inválido', async () => {
    const response = await request(app.getHttpServer())
      .patch('/api/v1/platform-users/me/login-email')
      .set('Authorization', 'Bearer test-access-token')
      .send({ email: 'correo-invalido', currentPassword: 'Passw0rd!Segura' })
      .expect(400);

    expect(response.body.message).toContain('Ingresa un correo de acceso válido.');
  });

  it('POST /platform-users/me/change-password retorna 200 cuando actualiza la contraseña', async () => {
    platformUsersServiceMock.changePassword.mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .post('/api/v1/platform-users/me/change-password')
      .set('Authorization', 'Bearer test-access-token')
      .send({
        currentPassword: 'Passw0rd!Segura',
        newPassword: 'NuevaPass!2026',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.message).toBe('Contraseña actualizada correctamente.');
      });
  });
});
