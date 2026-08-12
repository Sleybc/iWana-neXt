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
import { AuditController } from './audit.controller';
import { AuditQueryService } from './audit-query.service';

/**
 * HTTP: RBAC A-3 / D-SEC-01 — list incluye AUDITOR; export acotado sin AUDITOR.
 */
jest.mock('../auth/guards/jwt-auth.guard', () => ({
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

      if (isPublic) {
        return true;
      }

      const request = context.switchToHttp().getRequest();
      const authHeader = request.headers.authorization;

      if (authHeader === 'Bearer auditor-token') {
        request.user = {
          sub: 'usr-auditor',
          email: 'hash-auditor',
          role: UserRole.AUDITOR,
          tenantId: 'tenant-test',
          schemaName: 'tenant_test',
          jti: 'jti-auditor',
          type: 'tenant',
        };
        return true;
      }

      if (authHeader === 'Bearer support-token') {
        request.user = {
          sub: 'usr-support',
          email: 'hash-support',
          role: UserRole.SUPPORT,
          tenantId: 'tenant-test',
          schemaName: 'tenant_test',
          jti: 'jti-support',
          type: 'tenant',
        };
        return true;
      }

      if (authHeader === 'Bearer sales-token') {
        request.user = {
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
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'No tienes autorización para esta operación.',
        });
      }

      return true;
    }
  },
}));

describe('AuditController HTTP (A-3 / D-SEC-01)', () => {
  let app: INestApplication;

  const listResponse = {
    data: [
      {
        id: 'audit-1',
        tenantId: 'tenant-test',
        userId: 'usr-1',
        actor: { id: 'usr-1', type: 'tenant', displayName: 'Actor sintético' },
        action: 'UPDATE',
        entityType: 'User',
        entityId: 'entity-1',
        oldValue: null,
        newValue: { status: 'ACTIVE' },
        ipAddress: null,
        userAgent: null,
        requestId: null,
        createdAt: '2026-08-11T00:00:00.000Z',
      },
    ],
    nextCursor: null,
    total: 1,
  };

  const auditQueryServiceMock = {
    query: jest.fn(),
    exportCsv: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [
        { provide: AuditQueryService, useValue: auditQueryServiceMock },
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
    auditQueryServiceMock.query.mockResolvedValue(listResponse);
    auditQueryServiceMock.exportCsv.mockResolvedValue({
      csv: 'createdAt,action\n',
      truncated: false,
      rowCount: 0,
    });
  });

  it('GET /audit-logs retorna 200 para AUDITOR', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/audit-logs')
      .set('Authorization', 'Bearer auditor-token')
      .expect(200);

    expect(response.body.total).toBe(1);
    expect(auditQueryServiceMock.query).toHaveBeenCalledTimes(1);
  });

  it('GET /audit-logs retorna 200 para ADMIN', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/audit-logs')
      .set('Authorization', 'Bearer admin-token')
      .expect(200);

    expect(auditQueryServiceMock.query).toHaveBeenCalledTimes(1);
  });

  it('GET /audit-logs retorna 403 para rol no autorizado (SUPPORT)', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/audit-logs')
      .set('Authorization', 'Bearer support-token')
      .expect(403);

    expect(auditQueryServiceMock.query).not.toHaveBeenCalled();
  });

  it('GET /audit-logs retorna 403 para SALES', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/audit-logs')
      .set('Authorization', 'Bearer sales-token')
      .expect(403);

    expect(auditQueryServiceMock.query).not.toHaveBeenCalled();
  });

  it('GET /audit-logs/export retorna 403 para AUDITOR (export acotado)', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/audit-logs/export')
      .set('Authorization', 'Bearer auditor-token')
      .expect(403);

    expect(auditQueryServiceMock.exportCsv).not.toHaveBeenCalled();
  });

  it('GET /audit-logs/export retorna 200 para ADMIN', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/audit-logs/export')
      .set('Authorization', 'Bearer admin-token')
      .expect(200);

    expect(auditQueryServiceMock.exportCsv).toHaveBeenCalledTimes(1);
  });
});
