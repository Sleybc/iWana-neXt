import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
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
      'Bearer archive-admin-token': { sub: 'user-archive-admin' },
    };
    const matchedUser = authorization ? userByToken[authorization] : undefined;

    if (!matchedUser) {
      throw new UnauthorizedException('Token de prueba inválido.');
    }

    req.user = {
      ...matchedUser,
      email: 'test-user-hash',
      role: matchedUser.sub === 'user-archive-admin' ? UserRole.ADMIN : UserRole.SUPPORT,
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
    archive: jest.fn(),
    update: jest.fn(),
    changePlan: jest.fn(),
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
        if (userId === 'user-archive-admin') {
          return [
            AccessPermissionKey.CRM_EXPEDIENTES_MANAGE,
            AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE,
          ];
        }
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
    contractsServiceMock.archive.mockResolvedValue({
      id: CONTRACT_ID,
      status: ContractStatus.ARCHIVED,
    });
    contractsServiceMock.update.mockResolvedValue({ id: CONTRACT_ID });
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

  describe('POST plan-change', () => {
    const body = {
      planId: 'plan-new',
      expectedUpdatedAt: '2026-10-30T12:00:00.000Z',
      expectedMonthlyPrice: 80000,
    };
    const send = (payload: object = body) =>
      request(app.getHttpServer())
        .post(`${API_PREFIX}/crm/contracts/${CONTRACT_ID}/plan-change`)
        .set('Authorization', 'Bearer expedientes-only-token')
        .send(payload);

    it('responde 200 con envelope y actor mediante el permiso de edición', async () => {
      contractsServiceMock.changePlan.mockResolvedValue({ id: CONTRACT_ID, planId: 'plan-new' });
      const response = await send();
      expect(response.status).toBe(200);
      expect(response.body.data.planId).toBe('plan-new');
      expect(contractsServiceMock.changePlan).toHaveBeenCalledWith(
        CONTRACT_ID,
        body,
        'user-expedientes-only',
      );
      expect(contractsServiceMock.assertContractNotBlocked).toHaveBeenCalledWith(CONTRACT_ID);
    });
    it.each([
      { ...body, planSnapshotJson: {} },
      { ...body, planId: '' },
      { ...body, expectedUpdatedAt: 'ayer' },
      { planId: 'plan-new' },
      { ...body, expectedMonthlyPrice: -1 },
    ])('rechaza body inválido %j', async (payload) => {
      expect((await send(payload)).status).toBe(400);
      expect(contractsServiceMock.changePlan).not.toHaveBeenCalled();
    });
    it('requiere autenticación', async () => {
      const response = await request(app.getHttpServer())
        .post(`${API_PREFIX}/crm/contracts/${CONTRACT_ID}/plan-change`)
        .send(body);
      expect(response.status).toBe(401);
    });
    it('requiere permiso de edición de contratos', async () => {
      const response = await request(app.getHttpServer())
        .post(`${API_PREFIX}/crm/contracts/${CONTRACT_ID}/plan-change`)
        .set('Authorization', 'Bearer subscribers-manage-token')
        .send(body);
      expect(response.status).toBe(403);
      expect(contractsServiceMock.changePlan).not.toHaveBeenCalled();
    });
    it('propaga versión obsoleta y bloqueo del titular', async () => {
      contractsServiceMock.changePlan.mockRejectedValueOnce(
        new ConflictException({ code: 'CONTRACT_CHANGED' }),
      );
      expect((await send()).body.code).toBe('CONTRACT_CHANGED');
      contractsServiceMock.assertContractNotBlocked.mockRejectedValueOnce(
        new ConflictException({ code: 'PRIVACY_DATA_BLOCKED' }),
      );
      expect((await send()).body.code).toBe('PRIVACY_DATA_BLOCKED');
      expect(contractsServiceMock.changePlan).toHaveBeenCalledTimes(1);
    });
    it('publica OpenAPI con body estricto, precios confirmados y respuesta tipada', () => {
      const doc = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().addBearerAuth(undefined, 'access-token').build(),
      );
      const operation = doc.paths['/api/v1/crm/contracts/{id}/plan-change']?.post;
      expect(operation?.requestBody).toMatchObject({
        content: {
          'application/json': {
            schema: {
              additionalProperties: false,
              required: ['planId', 'expectedUpdatedAt', 'expectedMonthlyPrice'],
            },
          },
        },
      });
      expect(operation?.responses['200']).toMatchObject({
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ContractResponseEnvelopeDto' },
          },
        },
      });
      expect(operation?.security).toEqual([{ 'access-token': [] }]);
    });
  });

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

  describe('POST archive para titular anonimizado', () => {
    const sendArchive = () =>
      request(app.getHttpServer())
        .post(`${API_PREFIX}/crm/contracts/${CONTRACT_ID}/archive`)
        .set('Authorization', 'Bearer archive-admin-token')
        .send({});

    it('permite llegar al servicio con la excepción explícita', async () => {
      const response = await sendArchive();

      expect(response.status).toBe(200);
      expect(contractsServiceMock.assertContractNotBlocked).toHaveBeenCalledWith(CONTRACT_ID, {
        allowAnonymized: true,
      });
      expect(contractsServiceMock.archive).toHaveBeenCalledWith(CONTRACT_ID, 'user-archive-admin');
    });

    it('sigue rechazando un titular DATOS_BLOQUEADOS', async () => {
      contractsServiceMock.assertContractNotBlocked.mockRejectedValueOnce(
        new ConflictException({ code: 'PRIVACY_DATA_BLOCKED' }),
      );

      const response = await sendArchive();

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('PRIVACY_DATA_BLOCKED');
      expect(contractsServiceMock.archive).not.toHaveBeenCalled();
    });

    it('sigue rechazando con 409 otras transiciones sobre un titular anonimizado', async () => {
      contractsServiceMock.assertContractNotBlocked.mockRejectedValueOnce(
        new ConflictException({ code: 'PRIVACY_TITULAR_ANONYMIZED' }),
      );

      const response = await request(app.getHttpServer())
        .post(`${API_PREFIX}/crm/contracts/${CONTRACT_ID}/terminate`)
        .set('Authorization', 'Bearer archive-admin-token')
        .send({ reasonCode: 'SOLICITUD_TITULAR' });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('PRIVACY_TITULAR_ANONYMIZED');
      expect(contractsServiceMock.terminate).not.toHaveBeenCalled();
      expect(contractsServiceMock.assertContractNotBlocked).toHaveBeenCalledWith(CONTRACT_ID);
    });

    it('mantiene PATCH /crm/contracts/:id en 409 para un titular anonimizado', async () => {
      contractsServiceMock.assertContractNotBlocked.mockRejectedValueOnce(
        new ConflictException({ code: 'PRIVACY_TITULAR_ANONYMIZED' }),
      );

      const response = await request(app.getHttpServer())
        .patch(`${API_PREFIX}/crm/contracts/${CONTRACT_ID}`)
        .set('Authorization', 'Bearer archive-admin-token')
        .send({ alias: 'Intento de restaurar datos' });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('PRIVACY_TITULAR_ANONYMIZED');
      expect(contractsServiceMock.assertContractNotBlocked).toHaveBeenCalledWith(CONTRACT_ID);
      expect(contractsServiceMock.update).not.toHaveBeenCalled();
    });
  });
});
