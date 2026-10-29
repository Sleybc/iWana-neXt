import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PrivacyRequestsController } from './requests.controller';
import { PrivacyRequestsService } from './requests.service';

const requestId = '60000000-0000-4000-8000-000000000001';
const actorId = '60000000-0000-4000-8000-000000000002';

describe('GET /privacy/requests/:id/evidence', () => {
  let app: INestApplication;
  const requestsService = {
    getRequesterEvidence: jest.fn().mockResolvedValue({
      url: 'https://storage.invalid/request-evidence',
      expiresAt: '2026-10-14T16:00:00.000Z',
    }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PrivacyRequestsController],
      providers: [{ provide: PrivacyRequestsService, useValue: requestsService }],
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

  it('devuelve la evidencia dentro de data', async () => {
    const response = await request(app.getHttpServer())
      .get(`/privacy/requests/${requestId}/evidence`)
      .expect(200);

    expect(response.body).toEqual({
      data: {
        url: 'https://storage.invalid/request-evidence',
        expiresAt: '2026-10-14T16:00:00.000Z',
      },
    });
    expect(requestsService.getRequesterEvidence).toHaveBeenCalledWith(requestId, actorId);
  });
});
