import {
  ForbiddenException,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { UserRole } from '@iwana/shared';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../access-control/guards/permissions.guard';
import { CommercialPickerSearchController } from './controllers/commercial-picker-search.controller';
import { CatalogService } from './services/catalog.service';

jest.mock('../auth/guards/jwt-auth.guard', () => ({
  JwtAuthGuard: class JwtAuthGuard {
    canActivate(context: {
      getHandler: () => unknown;
      getClass: () => unknown;
      switchToHttp: () => {
        getRequest: () => {
          headers: Record<string, string | undefined>;
          user?: JwtPayload & { id?: string };
        };
      };
    }): boolean {
      const handler = context.getHandler() as object;
      const classRef = context.getClass() as object;
      const isPublic =
        Reflect.getMetadata(IS_PUBLIC_KEY, handler) ?? Reflect.getMetadata(IS_PUBLIC_KEY, classRef);
      if (isPublic) return true;

      const request = context.switchToHttp().getRequest();
      const authHeader = request.headers.authorization;
      if (authHeader !== 'Bearer sales-token') {
        throw new UnauthorizedException('Token de acceso invalido o expirado.');
      }
      request.user = {
        id: 'usr-sales',
        sub: 'usr-sales',
        email: 'hash-sales',
        role: UserRole.SALES,
        tenantId: 'tenant-test',
        schemaName: 'tenant_test',
        jti: 'jti-sales',
        type: 'tenant',
      };
      return true;
    }
  },
}));

jest.mock('../access-control/guards/permissions.guard', () => ({
  PermissionsGuard: class PermissionsGuard {
    canActivate() {
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
      if (requiredRoles.length === 0) return true;
      if (!user || !requiredRoles.includes(user.role)) {
        throw new ForbiddenException('No tiene permisos para ejecutar esta acción.');
      }
      return true;
    }
  },
}));

describe('CommercialPickerSearchController HTTP', () => {
  let app: INestApplication;
  const catalogServiceMock = {
    searchForPicker: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [CommercialPickerSearchController],
      providers: [
        { provide: CatalogService, useValue: catalogServiceMock },
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
  });

  it('GET /api/v1/commercial/plans/search mapea { id, label, sublabel }', async () => {
    catalogServiceMock.searchForPicker.mockResolvedValue({
      data: [{ id: 'plan-1', label: 'Plan Fibra 300', sublabel: 'Activo' }],
      total: 1,
    });

    await request(app.getHttpServer())
      .get('/api/v1/commercial/plans/search?q=fibra')
      .set('Authorization', 'Bearer sales-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toEqual([{ id: 'plan-1', label: 'Plan Fibra 300', sublabel: 'Activo' }]);
        expect(body.total).toBe(1);
      });
  });

  it('GET /api/v1/commercial/plans/search retorna 401 sin JWT', async () => {
    await request(app.getHttpServer()).get('/api/v1/commercial/plans/search?q=fibra').expect(401);
  });

  it('GET /api/v1/commercial/plans/search con q vacío devuelve top-N del catálogo', async () => {
    catalogServiceMock.searchForPicker.mockResolvedValue({
      data: [{ id: 'plan-1', label: 'Plan Fibra 300', sublabel: 'Activo' }],
      total: 42,
    });

    await request(app.getHttpServer())
      .get('/api/v1/commercial/plans/search')
      .set('Authorization', 'Bearer sales-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toEqual([{ id: 'plan-1', label: 'Plan Fibra 300', sublabel: 'Activo' }]);
        expect(body.total).toBe(42);
      });
  });

  it('rechaza limit mayor a 20', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/commercial/additional-products/search?q=router&limit=50')
      .set('Authorization', 'Bearer sales-token')
      .expect(400);

    expect(catalogServiceMock.searchForPicker).not.toHaveBeenCalled();
  });

  it('GET /api/v1/commercial/additional-services/search delega type SERVICE', async () => {
    catalogServiceMock.searchForPicker.mockResolvedValue({ data: [], total: 0 });

    await request(app.getHttpServer())
      .get('/api/v1/commercial/additional-services/search?q=ip')
      .set('Authorization', 'Bearer sales-token')
      .expect(200);

    expect(catalogServiceMock.searchForPicker).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SERVICE' }),
    );
  });
});
