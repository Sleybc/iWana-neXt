import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthorizationsController } from './authorizations.controller';
import { AuthorizationsService } from './authorizations.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { AuditService } from '../../audit/audit.service';
import { AuditAction } from '@iwana/shared';

const partyId = '3e54ed12-5ad4-4f28-b7de-a8dd227b95c4';
const authorizationId = '9a8f8808-c0e8-4b57-a79d-d29c501abc31';
const actorId = '271bbbe1-2a56-4b64-9a2c-852c2b735cc2';

describe('POST /privacy/authorizations', () => {
  let app: INestApplication;
  const authorizationsService = {
    create: jest
      .fn()
      .mockResolvedValue({ authorizationId: '9a8f8808-c0e8-4b57-a79d-d29c501abc31' }),
    proof: jest.fn().mockResolvedValue({
      legalTextVersion: '1.0',
      sha256: 'a'.repeat(64),
      evidenceUrl: 'https://storage.invalid/privacy-proof',
    }),
  };
  const auditService = { log: jest.fn().mockResolvedValue(undefined) };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthorizationsController],
      providers: [
        { provide: AuthorizationsService, useValue: authorizationsService },
        { provide: AuditService, useValue: auditService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = {
            sub: actorId,
            type: 'tenant',
            role: 'AUDITOR',
          };
          return true;
        },
      })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    authorizationsService.create.mockClear();
    authorizationsService.proof.mockClear();
    auditService.log.mockClear();
  });

  it('responde 400 cuando el medio no pertenece a ConsentChannel', async () => {
    await request(app.getHttpServer())
      .post('/privacy/authorizations')
      .send({
        partyId: '3e54ed12-5ad4-4f28-b7de-a8dd227b95c4',
        purpose: 'TRATAMIENTO_CONTRACTUAL',
        granted: true,
        channel: 'CRM_CONVERSION',
        legalTextId: '6f199f37-a724-437b-a1e1-723410ec87ee',
      })
      .expect(400);

    expect(authorizationsService.create).not.toHaveBeenCalled();
  });

  it('devuelve la prueba sin caché y audita su consulta sin PII', async () => {
    const response = await request(app.getHttpServer())
      .get(`/privacy/parties/${partyId}/authorizations/${authorizationId}/proof`)
      .expect(200);

    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.data).toEqual({
      legalTextVersion: '1.0',
      sha256: 'a'.repeat(64),
      evidenceUrl: 'https://storage.invalid/privacy-proof',
    });
    expect(authorizationsService.proof).toHaveBeenCalledWith(partyId, authorizationId);
    expect(auditService.log).toHaveBeenCalledWith({
      action: AuditAction.RECORD_ACCESS,
      entityType: 'DataAuthorization',
      entityId: authorizationId,
      userId: actorId,
      newValue: {
        operation: 'AUTHORIZATION_PROOF_VIEWED',
        authorizationId,
      },
    });
    expect(JSON.stringify(auditService.log.mock.calls[0]?.[0])).not.toMatch(
      /evidenceUrl|legalTextVersion|sha256|document|email|phone/i,
    );
  });
});
