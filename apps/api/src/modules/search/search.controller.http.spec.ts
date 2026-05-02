import {
  ForbiddenException,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PlatformRole, UserRole } from '@iwana/shared';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

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

      if (authHeader === 'Bearer platform-support-token') {
        request.user = {
          sub: 'platform-support-sub',
          email: 'hash-platform-support',
          role: PlatformRole.IWANA_SUPPORT,
          tenantId: null,
          schemaName: null,
          jti: 'jti-platform-support',
          type: 'platform',
        };
        return true;
      }

      if (authHeader === 'Bearer platform-admin-token') {
        request.user = {
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

      if (authHeader === 'Bearer tenant-admin-token') {
        request.user = {
          sub: 'tenant-admin-sub',
          email: 'hash-tenant-admin',
          role: UserRole.ADMIN,
          tenantId: 'tenant-1',
          schemaName: 'tenant_test',
          jti: 'jti-tenant-admin',
          type: 'tenant',
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
        throw new ForbiddenException('No tiene permisos para ejecutar esta acción.');
      }

      return true;
    }
  },
}));

describe('SearchController HTTP', () => {
  let app: INestApplication;

  const searchService = {
    searchGlobal: jest.fn(),
    rebuildGlobalIndex: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [{ provide: SearchService, useValue: searchService }, JwtAuthGuard, RolesGuard],
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
  });

  it('GET /api/v1/search/global retorna resultados agrupados para rol de plataforma', async () => {
    searchService.searchGlobal.mockResolvedValue({
      query: 'lili',
      groups: [],
      tookMs: 8,
    });

    await request(app.getHttpServer())
      .get('/api/v1/search/global?q=lili&limit=5')
      .set('Authorization', 'Bearer platform-support-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.query).toBe('lili');
        expect(body.data.tookMs).toBe(8);
      });

    expect(searchService.searchGlobal).toHaveBeenCalledWith('lili', 5);
  });

  it('GET /api/v1/search/global retorna 400 con query menor a 2 caracteres', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/search/global?q=a')
      .set('Authorization', 'Bearer platform-admin-token')
      .expect(400);
  });

  it('GET /api/v1/search/global retorna 403 para rol tenant', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/search/global?q=lili')
      .set('Authorization', 'Bearer tenant-admin-token')
      .expect(403);
  });

  it('POST /api/v1/search/global/rebuild exige SYSTEM_ADMIN', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/search/global/rebuild')
      .set('Authorization', 'Bearer platform-support-token')
      .expect(403);
  });
});
