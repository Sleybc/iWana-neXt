import { ForbiddenException, INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { ExecutionOrderResult, ExecutionOrderStatus, UserRole } from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { ExecutionOrdersController } from '../execution-orders.controller';
import { ExecutionOrdersService } from '../services/execution-orders.service';

jest.mock('../../auth/guards/jwt-auth.guard', () => ({
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

      if (isPublic) return true;

      const req = context.switchToHttp().getRequest();
      const authHeader = req.headers.authorization;

      if (authHeader === 'Bearer support-token') {
        req.user = {
          sub: 'support-001',
          email: 'support@example.test',
          role: UserRole.SUPPORT,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          jti: 'jti-support',
          type: 'tenant',
        } as JwtPayload;
        return true;
      }

      if (authHeader === 'Bearer tech-token') {
        req.user = {
          sub: 'tech-001',
          email: 'tech@example.test',
          role: UserRole.TECHNICIAN,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          jti: 'jti-tech',
          type: 'tenant',
        } as JwtPayload;
        return true;
      }

      throw new UnauthorizedException('Token de acceso invalido o expirado.');
    }
  },
}));

jest.mock('../../auth/guards/roles.guard', () => ({
  RolesGuard: class RolesGuard {
    canActivate(context: {
      switchToHttp: () => { getRequest: () => { user?: JwtPayload } };
      getHandler: () => unknown;
      getClass: () => unknown;
    }): boolean {
      const req = context.switchToHttp().getRequest();
      const user = req.user;
      const requiredRoles: string[] =
        Reflect.getMetadata('roles', context.getHandler() as object) ??
        Reflect.getMetadata('roles', context.getClass() as object) ??
        [];

      if (requiredRoles.length === 0) return true;
      if (!user || !requiredRoles.includes(user.role)) {
        throw new ForbiddenException('No tiene permisos para ejecutar esta accion.');
      }

      return true;
    }
  },
}));

describe('ExecutionOrdersController HTTP', () => {
  let app: INestApplication;

  const executionOrdersServiceMock = {
    getById: jest.fn(),
    listActivities: jest.fn(),
    listItemUsage: jest.fn(),
    start: jest.fn(),
    registerFieldWork: jest.fn(),
    registerItemUsage: jest.fn(),
    close: jest.fn(),
  };

  const ORDER_UUID = '22222222-2222-4222-8222-222222222222';

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ExecutionOrdersController],
      providers: [
        { provide: ExecutionOrdersService, useValue: executionOrdersServiceMock },
        JwtAuthGuard,
        RolesGuard,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 without token', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/tasks/execution-orders/${ORDER_UUID}`)
      .expect(401);
  });

  it('starts and closes an execution order', async () => {
    executionOrdersServiceMock.start.mockResolvedValue({
      id: ORDER_UUID,
      status: ExecutionOrderStatus.IN_PROGRESS,
    });
    executionOrdersServiceMock.close.mockResolvedValue({
      id: ORDER_UUID,
      status: ExecutionOrderStatus.COMPLETED,
      result: ExecutionOrderResult.EXECUTED,
    });

    await request(app.getHttpServer())
      .post(`/api/v1/tasks/execution-orders/${ORDER_UUID}/start`)
      .set('Authorization', 'Bearer tech-token')
      .send({ notes: 'Salida hacia sitio' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/tasks/execution-orders/${ORDER_UUID}/close`)
      .set('Authorization', 'Bearer tech-token')
      .send({ result: ExecutionOrderResult.EXECUTED, closeNotes: 'Trabajo completado' })
      .expect(201);
  });
});
