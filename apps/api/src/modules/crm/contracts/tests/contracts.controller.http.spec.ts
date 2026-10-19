import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AccessPermissionKey, UserRole } from '@iwana/shared';
import { JwtPayload } from '../../../auth/interfaces/jwt-payload.interface';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../auth/guards/roles.guard';
import { EffectivePermissionsService } from '../../../access-control/services/effective-permissions.service';
import { PermissionsGuard } from '../../../access-control/guards/permissions.guard';
import { ContractsController } from '../contracts.controller';
import { ContractsService } from '../contracts.service';
import { ContractsBlockedTitularGuard } from '../guards/contracts-blocked-titular.guard';
import { ContractStatus } from '../../enums/contract-status.enum';

const CONTRACT_ID = '7b9c5f44-4fc7-4d10-94f0-6af63c2e15bb';
const API_PREFIX = '/api/v1';

const lifecycleRequests = [
  {
    action: 'suspend',
    body: { reasonCode: 'MORA' },
    resultingStatus: ContractStatus.SUSPENDED,
  },
  {
    action: 'reactivate',
    body: { reasonCode: 'PAGO_REGISTRADO' },
    resultingStatus: ContractStatus.ACTIVE,
  },
  {
    action: 'terminate',
    body: { reasonCode: 'SOLICITUD_TITULAR' },
    resultingStatus: ContractStatus.TERMINATED,
  },
] as const;

interface HarnessRequest {
  headers: Record<string, string | undefined>;
  user?: JwtPayload;
}

class LifecycleHarnessJwtGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<HarnessRequest>();
    const authorization = req.headers.authorization;
    const userByToken: Record<string, Pick<JwtPayload, 'sub'>> = {
      'Bearer expedientes-only-token': { sub: 'user-expedientes-only' },
      'Bearer subscribers-manage-token': { sub: 'user-subscribers-manage' },
    };
    const matchedUser = authorization ? userByToken[authorization] : undefined;

    if (!matchedUser) {
      throw new UnauthorizedException('Token de prueba inválido.');
    }

    req.user = {
      ...matchedUser,
      email: 'test-user-hash',
      role: UserRole.SUPPORT,
      tenantId: 'tenant-test',
      schemaName: 'tenant_test',
      jti: 'jti-test',
      type: 'tenant',
    };
    return true;
  }
}

describe('ContractsController lifecycle permissions over HTTP (RF-LO-20)', () => {
  let app: INestApplication;

  const contractsServiceMock = {
    assertContractNotBlocked: jest.fn(),
    suspend: jest.fn(),
    reactivate: jest.fn(),
    terminate: jest.fn(),
  };
  const effectivePermissionsServiceMock = {
    getEffectivePermissionsForUser: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ContractsController],
      providers: [
        { provide: ContractsService, useValue: contractsServiceMock },
        { provide: EffectivePermissionsService, useValue: effectivePermissionsServiceMock },
        JwtAuthGuard,
        RolesGuard,
        PermissionsGuard,
        ContractsBlockedTitularGuard,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(LifecycleHarnessJwtGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    effectivePermissionsServiceMock.getEffectivePermissionsForUser.mockImplementation(
      async (userId: string) => {
        if (userId === 'user-expedientes-only') {
          return [AccessPermissionKey.CRM_EXPEDIENTES_MANAGE];
        }
        return [AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE];
      },
    );
    contractsServiceMock.assertContractNotBlocked.mockResolvedValue(undefined);
    for (const { action, resultingStatus } of lifecycleRequests) {
      contractsServiceMock[action].mockResolvedValue({ id: CONTRACT_ID, status: resultingStatus });
    }
  });

  it.each(lifecycleRequests)(
    'responde 403 en $action si solo tiene CRM_EXPEDIENTES_MANAGE',
    async ({ action, body }) => {
      const response = await request(app.getHttpServer())
        .post(`${API_PREFIX}/crm/contracts/${CONTRACT_ID}/${action}`)
        .set('Authorization', 'Bearer expedientes-only-token')
        .send(body);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('FORBIDDEN');
      expect(contractsServiceMock[action]).not.toHaveBeenCalled();
    },
  );

  it.each(lifecycleRequests)(
    'permite $action por HTTP con CRM_SUBSCRIBERS_MANAGE',
    async ({ action, body, resultingStatus }) => {
      const response = await request(app.getHttpServer())
        .post(`${API_PREFIX}/crm/contracts/${CONTRACT_ID}/${action}`)
        .set('Authorization', 'Bearer subscribers-manage-token')
        .send(body);

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ id: CONTRACT_ID, status: resultingStatus });
      expect(contractsServiceMock[action]).toHaveBeenCalledTimes(1);
    },
  );
});
