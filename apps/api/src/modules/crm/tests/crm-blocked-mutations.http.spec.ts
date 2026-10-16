import {
  CanActivate,
  ConflictException,
  ExecutionContext,
  Injectable,
  INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { getDataSourceToken } from '@nestjs/typeorm';
import { UserRole, AccessPermissionKey } from '@iwana/shared';
import request from 'supertest';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
import { AuditService } from '../../audit/audit.service';
import { IPrivacyMarksReadPort } from '../../privacy/ports/privacy-marks-read.port';
import { SubscribersController } from '../subscribers/subscribers.controller';
import { SubscribersService } from '../subscribers/subscribers.service';
import { ContractsController } from '../contracts/contracts.controller';
import { ContractsService } from '../contracts/contracts.service';
import { ExpedientesController } from '../expedientes/expedientes.controller';
import { ExpedienteService } from '../expedientes/expediente.service';
import { StatusTransitionService } from '../expedientes/status-transition.service';
import { CompletenessCalculator } from '../expedientes/completeness-calculator.service';
import { PipelineRecommendationService } from '../expedientes/pipeline-recommendation.service';
import { ExpedienteDetailBootstrapService } from '../expedientes/expediente-detail-bootstrap.service';

const TEST_UUID = '7b9c5f44-4fc7-4d10-94f0-6af63c2e15bb';
const TEST_PERMISSION_SET = [
  AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE,
  AccessPermissionKey.CRM_EXPEDIENTES_MANAGE,
];

interface TestRequest {
  headers: Record<string, string | undefined>;
  user?: { sub: string; role: string; type: 'tenant'; tenantId: string; schemaName: string };
}

class HarnessJwtGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<TestRequest>();
    const role = req.headers['x-test-role'] ?? UserRole.SALES;
    req.user = {
      sub: `test-${role.toLowerCase()}`,
      role,
      type: 'tenant',
      tenantId: 'tenant-test',
      schemaName: 'tenant_test',
    };
    return true;
  }
}

@Injectable()
class HarnessRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<TestRequest>();
    // Solo aísla la guarda de privacidad para las dos filas de permisos no CRM.
    if (req.headers['x-test-isolate-role'] === 'true') return true;
    return new RolesGuard(this.reflector).canActivate(context);
  }
}

function mutations(): Record<string, jest.Mock> {
  return {
    update: jest.fn(),
    updateSection: jest.fn(),
    remove: jest.fn(),
    transitionStatus: jest.fn(),
    createContactAttempt: jest.fn(),
    createConsent: jest.fn(),
    revokeConsent: jest.fn(),
    createCoverageCheck: jest.fn(),
    updateDocumentSupportStatus: jest.fn(),
    deleteDocumentSupport: jest.fn(),
    linkInstallationOperationalRefs: jest.fn(),
    retryConversionEvent: jest.fn(),
    reactivate: jest.fn(),
    uploadDocumentSupport: jest.fn(),
    activate: jest.fn(),
    suspend: jest.fn(),
    terminate: jest.fn(),
    archive: jest.fn(),
    updateServicePoint: jest.fn(),
    uploadStratumEvidence: jest.fn(),
    removeStratumEvidence: jest.fn(),
    create: jest.fn(),
  };
}

describe('CRM blocked titular mutation guard over HTTP', () => {
  let app: INestApplication;
  let mutationSpies: Record<string, jest.Mock>;

  beforeAll(async () => {
    mutationSpies = mutations();
    const subscriber = {
      id: TEST_UUID,
      partyId: 'party-test',
      anonymizedAt: null,
    };
    const subscriberService = {
      findById: jest.fn().mockResolvedValue(subscriber),
      ...mutationSpies,
    };
    const contractService = {
      assertContractNotBlocked: jest.fn().mockRejectedValue(
        new ConflictException({
          code: 'PRIVACY_DATA_BLOCKED',
          message: 'Los datos de este titular están bloqueados para edición.',
        }),
      ),
      assertSubscriberNotBlockedForMutation: jest.fn().mockRejectedValue(
        new ConflictException({
          code: 'PRIVACY_DATA_BLOCKED',
          message: 'Los datos de este titular están bloqueados para edición.',
        }),
      ),
      ...mutationSpies,
    };
    const expedienteService = {
      findById: jest.fn().mockResolvedValue({ id: TEST_UUID, anonymizedAt: null }),
      getPrivacyMarksForExpediente: jest.fn().mockResolvedValue(['DATOS_BLOQUEADOS']),
      ...mutationSpies,
    };
    const effectivePermissionsService = {
      getEffectivePermissionsForUser: jest.fn().mockImplementation((actorId: string) => {
        if (actorId === `test-${UserRole.ACCOUNTANT.toLowerCase()}`) {
          return [...TEST_PERMISSION_SET, AccessPermissionKey.CRM_BLOCKED_DATA_READ];
        }
        if (actorId.endsWith('privacy_reader')) {
          return [...TEST_PERMISSION_SET, AccessPermissionKey.PRIVACY_READ];
        }
        return TEST_PERMISSION_SET;
      }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [SubscribersController, ContractsController, ExpedientesController],
      providers: [
        { provide: Reflector, useValue: new Reflector() },
        {
          provide: EffectivePermissionsService,
          useValue: effectivePermissionsService,
        },
        { provide: SubscribersService, useValue: subscriberService },
        { provide: ContractsService, useValue: contractService },
        { provide: ExpedienteService, useValue: expedienteService },
        {
          provide: IPrivacyMarksReadPort,
          useValue: {
            activeMarks: jest.fn().mockResolvedValue({ 'party-test': ['DATOS_BLOQUEADOS'] }),
          },
        },
        { provide: AuditService, useValue: { log: jest.fn(), logWithin: jest.fn() } },
        { provide: getDataSourceToken(), useValue: {} },
        { provide: StatusTransitionService, useValue: {} },
        { provide: CompletenessCalculator, useValue: {} },
        { provide: PipelineRecommendationService, useValue: {} },
        { provide: ExpedienteDetailBootstrapService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(HarnessJwtGuard)
      .overrideGuard(RolesGuard)
      .useClass(HarnessRolesGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(PermissionsGuard)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    ['transición de estado', 'patch', `/crm/expedientes/${TEST_UUID}/status`],
    ['borrado', 'delete', `/crm/contracts/${TEST_UUID}`],
    ['subrecurso', 'post', `/crm/expedientes/${TEST_UUID}/contact-attempts`],
    ['mutación de contrato', 'patch', `/crm/contracts/${TEST_UUID}`],
    ['mutación de suscriptor', 'patch', `/crm/subscribers/${TEST_UUID}`],
  ])(
    '%s responde 409 a SALES, ACCOUNTANT y privacy.read sin escribir',
    async (_family, method, path) => {
      const actors = [
        { role: UserRole.SALES, isolateRole: false },
        { role: UserRole.ACCOUNTANT, isolateRole: true },
        { role: 'PRIVACY_READER', isolateRole: true },
      ];

      for (const actor of actors) {
        const http = request(app.getHttpServer());
        const call =
          method === 'delete'
            ? http.delete(path)
            : method === 'post'
              ? http.post(path)
              : http.patch(path);
        call.set('x-test-role', actor.role);
        if (actor.isolateRole) call.set('x-test-isolate-role', 'true');
        const response = await call.send({});
        expect(response.status).toBe(409);
        expect(response.body.code).toBe('PRIVACY_DATA_BLOCKED');
      }

      for (const spy of Object.values(mutationSpies)) expect(spy).not.toHaveBeenCalled();
    },
  );

  it('conserva el 403 de roles real para ACCOUNTANT cuando no se aísla RBAC', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/crm/contracts/${TEST_UUID}`)
      .set('x-test-role', UserRole.ACCOUNTANT)
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('FORBIDDEN');
  });
});
