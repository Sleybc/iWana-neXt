import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthorizationsController } from './authorizations.controller';
import { AuthorizationsService } from './authorizations.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';

describe('POST /privacy/authorizations', () => {
  let app: INestApplication;
  const authorizationsService = {
    create: jest
      .fn()
      .mockResolvedValue({ authorizationId: '9a8f8808-c0e8-4b57-a79d-d29c501abc31' }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthorizationsController],
      providers: [{ provide: AuthorizationsService, useValue: authorizationsService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
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
});
