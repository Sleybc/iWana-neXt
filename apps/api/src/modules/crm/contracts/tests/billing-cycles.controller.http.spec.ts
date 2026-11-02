import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AccessPermissionKey, UserRole } from '@iwana/shared';
import { JwtPayload } from '../../../auth/interfaces/jwt-payload.interface';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../auth/guards/roles.guard';
import { EffectivePermissionsService } from '../../../access-control/services/effective-permissions.service';
import { PermissionsGuard } from '../../../access-control/guards/permissions.guard';
import { ContractsService } from '../contracts.service';
import { BillingCyclesController } from '../billing-cycles.controller';

interface RequestWithUser {
  headers: Record<string, string | undefined>;
  user?: JwtPayload;
}

class BillingCycleHarnessJwtGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const authorization = request.headers.authorization;
    if (
      authorization !== 'Bearer billing-read-denied' &&
      authorization !== 'Bearer billing-read-sales' &&
      authorization !== 'Bearer billing-read-auditor'
    ) {
      throw new UnauthorizedException('Token de prueba inválido.');
    }
    const role =
      authorization === 'Bearer billing-read-sales'
        ? UserRole.SALES
        : authorization === 'Bearer billing-read-auditor'
          ? UserRole.AUDITOR
          : UserRole.ADMIN;
    request.user = {
      sub: `user-${role.toLowerCase()}`,
      email: 'test-user-hash',
      role,
      tenantId: 'tenant-test',
      schemaName: 'tenant_test',
      jti: 'jti-billing-test',
      type: 'tenant',
    };
    return true;
  }
}

describe('BillingCyclesController permissions over HTTP', () => {
  let app: INestApplication;
  const contractsServiceMock = {
    getActiveBillingCycles: jest.fn(),
    getCutoffAgenda: jest.fn(),
  };
  const effectivePermissionsServiceMock = {
    getEffectivePermissionsForUser: jest
      .fn()
      .mockResolvedValue([AccessPermissionKey.CRM_EXPEDIENTES_READ]),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [BillingCyclesController],
      providers: [
        { provide: ContractsService, useValue: contractsServiceMock },
        { provide: EffectivePermissionsService, useValue: effectivePermissionsServiceMock },
        JwtAuthGuard,
        RolesGuard,
        PermissionsGuard,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(BillingCycleHarnessJwtGuard)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    '/api/v1/crm/billing-cycles',
    '/api/v1/crm/billing-cycles/cutoff-agenda?date=2026-11-15',
  ])('CA-CF-09: responde 403 sin CRM_SUBSCRIBERS_READ en %s', async (path) => {
    const response = await request(app.getHttpServer())
      .get(path)
      .set('Authorization', 'Bearer billing-read-denied');

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('FORBIDDEN');
    expect(contractsServiceMock.getActiveBillingCycles).not.toHaveBeenCalled();
    expect(contractsServiceMock.getCutoffAgenda).not.toHaveBeenCalled();
  });

  it('CA-CF-13: SALES recibe el catálogo con la fecha de próximo corte', async () => {
    const options = [
      {
        cycleDay: 1,
        cutoffDay: 15,
        active: true,
        nextCutoffDate: '2026-11-15',
      },
    ];
    contractsServiceMock.getActiveBillingCycles.mockResolvedValue(options);
    effectivePermissionsServiceMock.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.CRM_SUBSCRIBERS_READ,
    ]);

    const response = await request(app.getHttpServer())
      .get('/api/v1/crm/billing-cycles')
      .set('Authorization', 'Bearer billing-read-sales');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(options);
  });

  it('AUDITOR con CRM_SUBSCRIBERS_READ recibe el catálogo por HTTP', async () => {
    const options = [
      {
        cycleDay: 1,
        cutoffDay: 15,
        active: true,
        nextCutoffDate: '2026-11-15',
      },
    ];
    contractsServiceMock.getActiveBillingCycles.mockResolvedValue(options);
    effectivePermissionsServiceMock.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.CRM_SUBSCRIBERS_READ,
    ]);

    const response = await request(app.getHttpServer())
      .get('/api/v1/crm/billing-cycles')
      .set('Authorization', 'Bearer billing-read-auditor');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(options);
  });
});
