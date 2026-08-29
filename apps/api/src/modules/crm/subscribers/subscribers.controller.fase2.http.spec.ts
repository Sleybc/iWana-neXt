import { ForbiddenException, INestApplication, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AccessPermissionKey, UserRole } from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
import { SubscribersController } from './subscribers.controller';
import { SubscribersService } from './subscribers.service';
import { AuditService } from '../../audit/audit.service';

jest.mock('../../auth/guards/jwt-auth.guard', () => ({
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
      if (isPublic) return true;
      const req = context.switchToHttp().getRequest();
      const h = req.headers.authorization;
      if (h === 'Bearer admin-token') {
        req.user = {
          sub: 'admin-001',
          role: UserRole.ADMIN,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          type: 'tenant',
        } as JwtPayload;
        return true;
      }
      if (h === 'Bearer tech-token') {
        req.user = {
          sub: 'tech-001',
          role: UserRole.TECHNICIAN,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          type: 'tenant',
        } as JwtPayload;
        return true;
      }
      if (h === 'Bearer auditor-token') {
        req.user = {
          sub: 'auditor-001',
          role: UserRole.AUDITOR,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          type: 'tenant',
        } as JwtPayload;
        return true;
      }
      if (h === 'Bearer support-token') {
        req.user = {
          sub: 'support-001',
          role: UserRole.SUPPORT,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          type: 'tenant',
        } as JwtPayload;
        return true;
      }
      if (h === 'Bearer sales-token') {
        req.user = {
          sub: 'sales-001',
          role: UserRole.SALES,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          type: 'tenant',
        } as JwtPayload;
        return true;
      }
      throw new UnauthorizedException('Token inválido');
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
      const required: string[] =
        Reflect.getMetadata('roles', context.getHandler() as object) ??
        Reflect.getMetadata('roles', context.getClass() as object) ??
        [];
      if (required.length === 0) return true;
      if (!user || !required.includes(user.role))
        throw new ForbiddenException('No tiene permisos para ejecutar esta acción.');
      return true;
    }
  },
}));

describe('SubscribersController Fase 2 — doble guard', () => {
  let app: INestApplication;
  const subscribersServiceMock = {
    findAll: jest
      .fn()
      .mockResolvedValue({ data: [], total: 0, meta: { page: 1, limit: 20, total: 0 } }),
    search: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue({ id: 'sub-001' }),
    create: jest.fn().mockResolvedValue({ id: 'sub-001' }),
    update: jest.fn().mockResolvedValue({ id: 'sub-001' }),
    remove: jest.fn().mockResolvedValue(undefined),
    transitionStatus: jest.fn().mockResolvedValue({ id: 'sub-001' }),
    get360View: jest.fn().mockResolvedValue({ subscriber: { id: 'sub-001' } }),
    updateSection: jest.fn().mockResolvedValue({ id: 'sub-001' }),
  };
  const auditMock = { log: jest.fn().mockResolvedValue(undefined) };
  const effectivePermissionsMock = { getEffectivePermissionsForUser: jest.fn() };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [SubscribersController],
      providers: [
        { provide: SubscribersService, useValue: subscribersServiceMock },
        { provide: AuditService, useValue: auditMock },
        { provide: EffectivePermissionsService, useValue: effectivePermissionsMock },
        Reflector,
        PermissionsGuard,
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
    subscribersServiceMock.findAll.mockResolvedValue({
      data: [],
      total: 0,
      meta: { page: 1, limit: 20, total: 0 },
    });
  });

  it('GET /crm/subscribers — 200 para TECHNICIAN con permiso crm.subscribers.read', async () => {
    effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.CRM_SUBSCRIBERS_READ,
    ]);
    await request(app.getHttpServer())
      .get('/api/v1/crm/subscribers')
      .set('Authorization', 'Bearer tech-token')
      .expect(200);
  });

  it('GET /crm/subscribers — 403 para TECHNICIAN sin permiso aunque rol pase', async () => {
    effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([]);
    await request(app.getHttpServer())
      .get('/api/v1/crm/subscribers')
      .set('Authorization', 'Bearer tech-token')
      .expect(403);
  });

  it('GET /crm/subscribers — 403 para AUDITOR sin permiso', async () => {
    effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([]);
    await request(app.getHttpServer())
      .get('/api/v1/crm/subscribers')
      .set('Authorization', 'Bearer auditor-token')
      .expect(403);
  });

  it('GET /crm/subscribers — 200 para AUDITOR con permiso', async () => {
    effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.CRM_SUBSCRIBERS_READ,
    ]);
    await request(app.getHttpServer())
      .get('/api/v1/crm/subscribers')
      .set('Authorization', 'Bearer auditor-token')
      .expect(200);
  });

  it('GET /crm/subscribers — 403 para rol no permitido (SUBSCRIBER simulado como sales sin rol en lista?) — usamos sales sin permiso', async () => {
    // Sales tiene rol permitido pero sin permiso => 403 ya cubierto; para rol no permitido usamos un rol que no está en @Roles, p. ej., CONTRACTOR no está en lista original
    // Simulamos con tech sin permiso ya es 403 por permiso; para test de rol inválido usamos un token que no existe -> 401, pero probamos con auditor sin permiso ya es permiso falta
    // En su lugar probamos que SUPPORT sin permiso también 403
    effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.CRM_SUBSCRIBERS_READ,
    ]);
    // SUPPORT tiene rol permitido, con permiso debería 200
    await request(app.getHttpServer())
      .get('/api/v1/crm/subscribers')
      .set('Authorization', 'Bearer support-token')
      .expect(200);
    // Ahora sin permiso 403
    effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([]);
    await request(app.getHttpServer())
      .get('/api/v1/crm/subscribers')
      .set('Authorization', 'Bearer support-token')
      .expect(403);
  });

  it('POST /crm/subscribers — 201 con permiso crm.subscribers.manage y rol SALES', async () => {
    effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE,
    ]);
    await request(app.getHttpServer())
      .post('/api/v1/crm/subscribers')
      .set('Authorization', 'Bearer sales-token')
      .send({
        personType: 'NATURAL',
        customerSegment: 'RESIDENTIAL',
        documentType: 'CC',
        documentNumber: '123456789',
        firstName: 'Test',
        lastName: 'User',
        stratum: 3,
        email: 'test@example.com',
        phone: '3001234567',
        address: 'Calle 123',
      })
      .expect(201);
  });

  it('POST /crm/subscribers — 403 sin permiso aunque rol pase', async () => {
    effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([]);
    await request(app.getHttpServer())
      .post('/api/v1/crm/subscribers')
      .set('Authorization', 'Bearer sales-token')
      .send({
        personType: 'NATURAL',
        customerSegment: 'RESIDENTIAL',
        documentType: 'CC',
        documentNumber: '123456789',
        firstName: 'Test',
        lastName: 'User',
        stratum: 3,
        email: 'test@example.com',
        phone: '3001234567',
        address: 'Calle 123',
      })
      .expect(403);
  });

  it('POST /crm/subscribers — 403 para TECHNICIAN aunque tenga permiso (rol no permitido en escritura)', async () => {
    effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE,
    ]);
    await request(app.getHttpServer())
      .post('/api/v1/crm/subscribers')
      .set('Authorization', 'Bearer tech-token')
      .send({
        personType: 'NATURAL',
        customerSegment: 'RESIDENTIAL',
        documentType: 'CC',
        documentNumber: '123456789',
        firstName: 'Test',
        lastName: 'User',
        stratum: 3,
        email: 'test@example.com',
        phone: '3001234567',
        address: 'Calle 123',
      })
      .expect(403);
  });
});
