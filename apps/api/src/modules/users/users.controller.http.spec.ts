import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PlatformRole, AccessPermissionKey, UserRole, UserStatus } from '@iwana/shared';
import { PermissionsGuard } from '../access-control/guards/permissions.guard';
import { EffectivePermissionsService } from '../access-control/services/effective-permissions.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

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

      if (authHeader === 'Bearer noc-token') {
        request.user = {
          sub: 'usr-noc',
          email: 'hash-noc',
          role: UserRole.NOC,
          tenantId: 'tenant-test',
          schemaName: 'tenant_test',
          jti: 'jti-noc',
          type: 'tenant',
        };
        return true;
      }

      if (authHeader === 'Bearer restricted-admin-token') {
        request.user = {
          sub: 'usr-admin-restricted',
          email: 'hash-admin-restricted',
          role: UserRole.ADMIN,
          tenantId: 'tenant-test',
          schemaName: 'tenant_test',
          jti: 'jti-admin-restricted',
          type: 'tenant',
        };
        return true;
      }

      if (authHeader === 'Bearer system-admin-token') {
        request.user = {
          sub: 'usr-system-admin',
          email: 'hash-system-admin',
          role: PlatformRole.SYSTEM_ADMIN,
          tenantId: null,
          schemaName: null,
          jti: 'jti-system-admin',
          type: 'platform',
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
        return false;
      }

      return true;
    }
  },
}));

describe('UsersController HTTP', () => {
  let app: INestApplication;
  const effectivePermissionsServiceMock = {
    getEffectivePermissionsForUser: jest.fn(),
  };

  const usersServiceMock = {
    findAll: jest.fn(),
    create: jest.fn(),
    findMe: jest.fn(),
    updateMe: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    changeLoginEmail: jest.fn(),
    changeLoginEmailAsAdmin: jest.fn(),
    resetPassword: jest.fn(),
    remove: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: usersServiceMock },
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
        if (userId === 'usr-admin-restricted') {
          return [];
        }

        return [AccessPermissionKey.USERS_MANAGE, AccessPermissionKey.USERS_READ];
      },
    );
  });

  it('GET /api/v1/users retorna 200 con lista paginada', async () => {
    usersServiceMock.findAll.mockResolvedValue({ data: [], meta: { nextCursor: null, total: 0 } });

    await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', 'Bearer admin-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.meta.total).toBe(0);
      });
  });

  it('H-07: GET /api/v1/users exige USERS_READ', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', 'Bearer restricted-admin-token')
      .expect(403);
  });

  it('H-16: GET /api/v1/users?limit=abc retorna 400', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/users?limit=abc')
      .set('Authorization', 'Bearer admin-token')
      .expect(400);
  });

  it('GET /api/v1/users propaga filtros status, role y search', async () => {
    usersServiceMock.findAll.mockResolvedValue({ data: [], meta: { nextCursor: null, total: 0 } });

    await request(app.getHttpServer())
      .get('/api/v1/users?status=ACTIVE&role=ADMIN&search=ana')
      .set('Authorization', 'Bearer admin-token')
      .expect(200);

    expect(usersServiceMock.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        status: UserStatus.ACTIVE,
        role: UserRole.ADMIN,
        search: 'ana',
      }),
    );
  });

  it('GET /api/v1/users retorna 401 sin JWT', async () => {
    await request(app.getHttpServer()).get('/api/v1/users').expect(401);
  });

  it('GET /api/v1/users retorna 403 con rol no autorizado', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', 'Bearer noc-token')
      .expect(403);
  });

  it('POST /api/v1/users retorna 201 con password temporal', async () => {
    usersServiceMock.create.mockResolvedValue({
      id: 'usr-1',
      temporaryPassword: 'temp1234567890abcdef',
    });

    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', 'Bearer admin-token')
      .set('Idempotency-Key', 'idem-1')
      .send({ email: 'usuario@empresa.com', role: UserRole.NOC })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data.temporaryPassword).toBeDefined();
      });

    expect(usersServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'usuario@empresa.com', role: UserRole.NOC }),
      'usr-admin',
      '::ffff:127.0.0.1',
      'idem-1',
    );
  });

  it('POST /api/v1/users retorna 403 cuando ADMIN no tiene users.manage', async () => {
    usersServiceMock.create.mockResolvedValue({
      id: 'usr-1',
      temporaryPassword: 'temp1234567890abcdef',
    });

    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', 'Bearer restricted-admin-token')
      .set('Idempotency-Key', 'idem-1-perm')
      .send({ email: 'usuario@empresa.com', role: UserRole.NOC })
      .expect(403);
  });

  it('POST /api/v1/users retorna 201 para SYSTEM_ADMIN aunque no tenga permisos tenant', async () => {
    usersServiceMock.create.mockResolvedValue({
      id: 'usr-system-created',
      temporaryPassword: 'temp1234567890abcdef',
    });

    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', 'Bearer system-admin-token')
      .set('Idempotency-Key', 'idem-1-platform')
      .send({ email: 'usuario@empresa.com', role: UserRole.NOC })
      .expect(201);
  });

  it('POST /api/v1/users retorna 400 sin Idempotency-Key', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', 'Bearer admin-token')
      .send({ email: 'usuario@empresa.com', role: UserRole.NOC })
      .expect(400);
  });

  it('POST /api/v1/users retorna 400 con email invalido', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', 'Bearer admin-token')
      .set('Idempotency-Key', 'idem-1b')
      .send({ email: 'correo-invalido', role: UserRole.NOC })
      .expect(400);
  });

  it('POST /api/v1/users retorna 409 cuando el servicio reporta duplicado', async () => {
    usersServiceMock.create.mockRejectedValue(new ConflictException('duplicado'));

    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', 'Bearer admin-token')
      .set('Idempotency-Key', 'idem-1c')
      .send({ email: 'usuario@empresa.com', role: UserRole.NOC })
      .expect(409);
  });

  it('GET /api/v1/users/me retorna 200 con perfil del actor', async () => {
    usersServiceMock.findMe.mockResolvedValue({ id: 'usr-admin' });

    await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', 'Bearer admin-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.id).toBe('usr-admin');
      });
  });

  it('GET /api/v1/users/me retorna 401 sin JWT', async () => {
    await request(app.getHttpServer()).get('/api/v1/users/me').expect(401);
  });

  it('PATCH /api/v1/users/me retorna 200 al actualizar perfil propio', async () => {
    usersServiceMock.updateMe.mockResolvedValue({ id: 'usr-admin', firstName: 'Nuevo' });

    await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Authorization', 'Bearer admin-token')
      .set('Idempotency-Key', 'idem-2')
      .send({ firstName: 'Nuevo' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.firstName).toBe('Nuevo');
      });
  });

  it('PATCH /api/v1/users/me retorna 400 sin Idempotency-Key', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Authorization', 'Bearer admin-token')
      .send({ firstName: 'Nuevo' })
      .expect(400);
  });

  it('GET /api/v1/users/:id retorna 200 para admin', async () => {
    usersServiceMock.findOne.mockResolvedValue({ id: 'usr-target' });

    await request(app.getHttpServer())
      .get('/api/v1/users/00000000-0000-4000-a000-000000000001')
      .set('Authorization', 'Bearer admin-token')
      .expect(200);

    expect(usersServiceMock.findOne).toHaveBeenCalledWith(
      '00000000-0000-4000-a000-000000000001',
      'usr-admin',
      UserRole.ADMIN,
    );
  });

  it('H-07: GET /api/v1/users/:id exige USERS_READ', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/users/00000000-0000-4000-a000-000000000001')
      .set('Authorization', 'Bearer restricted-admin-token')
      .expect(403);
  });

  it('PATCH /api/v1/users/:id retorna 200 con actualización', async () => {
    usersServiceMock.update.mockResolvedValue({ id: 'usr-target', status: UserStatus.ACTIVE });

    await request(app.getHttpServer())
      .patch('/api/v1/users/00000000-0000-4000-a000-000000000001')
      .set('Authorization', 'Bearer admin-token')
      .set('Idempotency-Key', 'idem-4')
      .send({ status: UserStatus.ACTIVE })
      .expect(200);
  });

  it('PATCH /api/v1/users/:id/login-email retorna 403 si el actor intenta cambiar un id distinto al suyo', async () => {
    usersServiceMock.changeLoginEmail.mockRejectedValue(
      new ForbiddenException('Solo puedes cambiar tu propio email de acceso.'),
    );

    await request(app.getHttpServer())
      .patch('/api/v1/users/00000000-0000-4000-a000-000000000099/login-email')
      .set('Authorization', 'Bearer admin-token')
      .send({ email: 'nuevo@empresa.com', currentPassword: 'Passw0rd!Segura' })
      .expect(403);
  });

  it('PATCH /api/v1/users/:id/login-email/admin retorna 200 en cambio administrativo exitoso', async () => {
    usersServiceMock.changeLoginEmailAsAdmin.mockResolvedValue({
      id: '00000000-0000-4000-a000-000000000001',
      email: 'nuevo.admin@empresa.com',
    });

    await request(app.getHttpServer())
      .patch('/api/v1/users/00000000-0000-4000-a000-000000000001/login-email/admin')
      .set('Authorization', 'Bearer admin-token')
      .set('Idempotency-Key', 'idem-login-email-admin-1')
      .send({ email: 'nuevo.admin@empresa.com' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.email).toBe('nuevo.admin@empresa.com');
      });
  });

  it('PATCH /api/v1/users/:id/login-email/admin retorna 400 sin Idempotency-Key', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/users/00000000-0000-4000-a000-000000000001/login-email/admin')
      .set('Authorization', 'Bearer admin-token')
      .send({ email: 'nuevo.admin@empresa.com' })
      .expect(400);
  });

  it('PATCH /api/v1/users/:id/login-email/admin retorna 403 cuando el servicio rechaza el cambio', async () => {
    usersServiceMock.changeLoginEmailAsAdmin.mockRejectedValue(new ForbiddenException('forbidden'));

    await request(app.getHttpServer())
      .patch('/api/v1/users/00000000-0000-4000-a000-000000000001/login-email/admin')
      .set('Authorization', 'Bearer admin-token')
      .set('Idempotency-Key', 'idem-login-email-admin-2')
      .send({ email: 'nuevo.admin@empresa.com' })
      .expect(403);
  });

  it('PATCH /api/v1/users/:id/password retorna 200 con password temporal', async () => {
    usersServiceMock.resetPassword.mockResolvedValue({ temporaryPassword: 'temp1234567890abcdef' });

    await request(app.getHttpServer())
      .patch('/api/v1/users/00000000-0000-4000-a000-000000000001/password')
      .set('Authorization', 'Bearer admin-token')
      .set('Idempotency-Key', 'idem-3')
      .send({})
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.temporaryPassword).toBeDefined();
      });
  });

  it('PATCH /api/v1/users/:id/password retorna 400 sin Idempotency-Key', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/users/00000000-0000-4000-a000-000000000001/password')
      .set('Authorization', 'Bearer admin-token')
      .send({})
      .expect(400);
  });

  it('PATCH /api/v1/users/:id/password retorna 403 cuando el servicio rechaza ADMIN -> SYSTEM_ADMIN', async () => {
    usersServiceMock.resetPassword.mockRejectedValue(new ForbiddenException('forbidden'));

    await request(app.getHttpServer())
      .patch('/api/v1/users/00000000-0000-4000-a000-000000000001/password')
      .set('Authorization', 'Bearer admin-token')
      .set('Idempotency-Key', 'idem-5')
      .send({})
      .expect(403);
  });

  it('DELETE /api/v1/users/:id retorna 204 en soft delete exitoso', async () => {
    usersServiceMock.remove.mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .delete('/api/v1/users/00000000-0000-4000-a000-000000000001')
      .set('Authorization', 'Bearer admin-token')
      .expect(204);
  });

  it('DELETE /api/v1/users/:id retorna 400 en auto-eliminacion', async () => {
    usersServiceMock.remove.mockRejectedValue(new BadRequestException('self-delete'));

    await request(app.getHttpServer())
      .delete('/api/v1/users/00000000-0000-4000-a000-000000000001')
      .set('Authorization', 'Bearer admin-token')
      .expect(400);
  });

  it('DELETE /api/v1/users/:id retorna 403 cuando ADMIN intenta eliminar ADMIN', async () => {
    usersServiceMock.remove.mockRejectedValue(new ForbiddenException('forbidden'));

    await request(app.getHttpServer())
      .delete('/api/v1/users/00000000-0000-4000-a000-000000000001')
      .set('Authorization', 'Bearer admin-token')
      .expect(403);
  });
});
