import {
  INestApplication,
  MiddlewareConsumer,
  Module,
  NestModule,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { TenantContext } from '@iwana/db';
import request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { TenantMiddleware } from '../tenant/tenant.middleware';
import { TenantService } from '../tenant/tenant.service';

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

      if (authHeader !== 'Bearer tenant-access-token') {
        throw new UnauthorizedException('Token de acceso invalido o expirado.');
      }

      request.user = {
        sub: 'user-uuid-1',
        email: 'hash-email-123',
        role: 'tenant_admin',
        tenantId: 'tenant-uuid-1',
        schemaName: 'tenant_isp_test',
        jti: 'jwt-jti-http-integration',
        type: 'tenant',
        exp: Math.floor(Date.now() / 1000) + 900,
      };

      return true;
    }
  },
}));

const tenantFixture = {
  id: 'tenant-uuid-1',
  slug: 'isp-test',
  schemaName: 'tenant_isp_test',
  status: 'ACTIVE',
};

@Module({
  controllers: [AuthController],
  providers: [
    TenantMiddleware,
    JwtAuthGuard,
    {
      provide: AuthService,
      useValue: {
        login: jest.fn(),
        refreshTokens: jest.fn(),
        logout: jest.fn(),
        setupMfa: jest.fn(),
        verifyMfaSetup: jest.fn(),
        disableMfa: jest.fn(),
        forgotPassword: jest.fn(),
        resetPassword: jest.fn(),
        changePassword: jest.fn(),
      },
    },
    {
      // El controlador lee de aqui los TTL de sesion para el maxAge de las
      // cookies; sin valor configurado responde con el default (15m / 7d).
      provide: ConfigService,
      useValue: {
        get: jest.fn().mockImplementation((key: string, defaultValue?: unknown) => defaultValue),
      },
    },
    {
      provide: TenantService,
      useValue: {
        findById: jest.fn(),
        findBySlug: jest.fn(),
      },
    },
    {
      provide: JwtService,
      useValue: {
        verify: jest.fn(),
      },
    },
  ],
})
class AuthTenantContextHttpTestModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantMiddleware).forRoutes(AuthController);
  }
}

describe('Auth HTTP tenant context integration', () => {
  let app: INestApplication;
  let authService: {
    login: jest.Mock;
    changePassword: jest.Mock;
  };
  let tenantService: {
    findById: jest.Mock;
    findBySlug: jest.Mock;
  };
  let jwtService: {
    verify: jest.Mock;
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AuthTenantContextHttpTestModule],
    }).compile();

    authService = moduleRef.get(AuthService);
    tenantService = moduleRef.get(TenantService);
    jwtService = moduleRef.get(JwtService);

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

    app.use(require('cookie-parser')());

    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('propaga TenantContext en login publico via X-Tenant-Slug antes de invocar AuthService', async () => {
    tenantService.findBySlug.mockResolvedValue(tenantFixture);
    authService.login.mockImplementation(async () => {
      expect(TenantContext.getOrThrow()).toEqual({
        tenantId: 'tenant-uuid-1',
        schemaName: 'tenant_isp_test',
        tenantSlug: 'isp-test',
      });

      return {
        accessToken: 'jwt-access-tenant',
        refreshToken: 'refresh-token-tenant',
      };
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Tenant-Slug', 'isp-test')
      .send({
        email: 'admin@isptest.co',
        password: 'Passw0rd!!',
      })
      .expect(200);

    expect(response.body.data.accessToken).toBe('jwt-access-tenant');
    expect(tenantService.findBySlug).toHaveBeenCalledWith('isp-test');
  });

  it('normaliza X-Tenant-Slug (trim + lowercase) antes de resolver TenantContext en login publico', async () => {
    tenantService.findBySlug.mockResolvedValue(tenantFixture);
    authService.login.mockResolvedValue({
      accessToken: 'jwt-access-tenant',
      refreshToken: 'refresh-token-tenant',
    });

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Tenant-Slug', '  ISP-TEST  ')
      .send({
        email: 'admin@isptest.co',
        password: 'Passw0rd!!',
      })
      .expect(200);

    expect(tenantService.findBySlug).toHaveBeenCalledWith('isp-test');
  });

  it('retorna 400 cuando X-Tenant-Slug contiene solo espacios en login publico', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Tenant-Slug', '   ')
      .send({
        email: 'admin@isptest.co',
        password: 'Passw0rd!!',
      })
      .expect(400);

    expect(tenantService.findBySlug).not.toHaveBeenCalled();
    expect(authService.login).not.toHaveBeenCalled();
  });

  it('propaga TenantContext en rutas protegidas usando claims verificados del JWT', async () => {
    jwtService.verify.mockReturnValue({
      sub: 'user-uuid-1',
      email: 'hash-email-123',
      role: 'tenant_admin',
      tenantId: 'tenant-uuid-1',
      schemaName: 'tenant_isp_test',
      jti: 'jwt-jti-http-integration',
      type: 'tenant',
    });
    tenantService.findById.mockResolvedValue(tenantFixture);
    authService.changePassword.mockImplementation(async () => {
      expect(TenantContext.getOrThrow()).toEqual({
        tenantId: 'tenant-uuid-1',
        schemaName: 'tenant_isp_test',
        tenantSlug: 'isp-test',
      });
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/change-password')
      .set('Authorization', 'Bearer tenant-access-token')
      .send({
        currentPassword: 'Passw0rd!!',
        newPassword: 'NewPassw0rd!!',
      })
      .expect(200);

    expect(response.body.data.message).toBe('Contrasena actualizada correctamente.');
    expect(jwtService.verify).toHaveBeenCalledWith('tenant-access-token');
    expect(tenantService.findById).toHaveBeenCalledWith('tenant-uuid-1');
  });
});
