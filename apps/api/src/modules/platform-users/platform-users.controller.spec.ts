import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
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
    signPlatformToken(): string {
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
      if (req.headers.authorization !== 'Bearer test-access-token') {
        throw new UnauthorizedException('Token de acceso invalido o expirado.');
      }

      req.user = {
        sub: '2cfa4585-c2f2-49d3-8f42-1265f951a7a9',
        role: PlatformRole.SYSTEM_ADMIN,
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

jest.mock('../auth/guards/roles.guard', () => ({
  RolesGuard: class RolesGuard {
    canActivate(): boolean {
      return true;
    }
  },
}));

describe('PlatformUsersController HTTP', () => {
  let app: INestApplication;

  const platformUsersServiceMock = {
    getProfile: jest.fn<() => Promise<Record<string, unknown>>>(),
    updateProfile: jest.fn<() => Promise<Record<string, unknown>>>(),
    changeLoginEmail: jest.fn<() => Promise<Record<string, unknown>>>(),
    changePassword: jest.fn<() => Promise<void>>(),
  };

  const authServiceMock = {
    signPlatformToken: jest.fn().mockReturnValue('mock-platform-access-token'),
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

  it('GET /platform-users/me retorna 401 sin token', async () => {
    await request(app.getHttpServer()).get('/api/v1/platform-users/me').expect(401);
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
