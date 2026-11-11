import { CanActivate, ConflictException, ExecutionContext, INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { UserRole } from '@iwana/shared';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../auth/guards/roles.guard';
import { PermissionsGuard } from '../../../access-control/guards/permissions.guard';
import { ContractPermanenceController } from '../contract-permanence.controller';
import { ContractPermanenceService } from '../contract-permanence.service';
import { ContractsService } from '../contracts.service';
import { ContractsBlockedTitularGuard } from '../guards/contracts-blocked-titular.guard';

const CONTRACT_ID = '22222222-2222-4222-8222-222222222222';

class HarnessJwtGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const role = req.headers['x-test-role'] ?? UserRole.SALES;
    req.user = { sub: 'actor-sub', role, type: 'tenant', tenantId: 't', schemaName: 'tenant_t' };
    return true;
  }
}

class AllowGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}

describe('ContractPermanenceController HTTP (bloque H)', () => {
  let app: INestApplication;
  const service = { get: jest.fn(), set: jest.fn() };
  const contractsService = { assertContractNotBlocked: jest.fn() };
  const VIEW = {
    permanence: {
      accepted: false,
      months: null,
      connectionFee: null,
      discountedOrDeferredAmount: null,
      startDate: null,
      endDate: null,
      schedule: [],
    },
    planOffer: null,
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ContractPermanenceController],
      providers: [
        { provide: ContractPermanenceService, useValue: service },
        { provide: ContractsService, useValue: contractsService },
        ContractsBlockedTitularGuard,
        Reflector,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(HarnessJwtGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(AllowGuard)
      .overrideGuard(RolesGuard)
      .useFactory({
        factory: (reflector: Reflector) => new RolesGuard(reflector),
        inject: [Reflector],
      })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    contractsService.assertContractNotBlocked.mockResolvedValue(undefined);
  });

  it('GET devuelve la vista', async () => {
    service.get.mockResolvedValue(VIEW);
    const res = await request(app.getHttpServer())
      .get(`/crm/contracts/${CONTRACT_ID}/permanence`)
      .expect(200);
    expect(res.body).toEqual({ data: VIEW });
  });

  it('PUT pasa accepted y el actor del JWT tras la guarda del titular', async () => {
    service.set.mockResolvedValue(VIEW);
    await request(app.getHttpServer())
      .put(`/crm/contracts/${CONTRACT_ID}/permanence`)
      .send({ accepted: false })
      .expect(200);
    expect(contractsService.assertContractNotBlocked).toHaveBeenCalledWith(CONTRACT_ID);
    expect(service.set).toHaveBeenCalledWith(CONTRACT_ID, false, 'actor-sub');
  });

  it.each([{}, { accepted: 'si' }, { accepted: true, months: 3 }])(
    'PUT rechaza %j con 400',
    async (body) => {
      await request(app.getHttpServer())
        .put(`/crm/contracts/${CONTRACT_ID}/permanence`)
        .send(body)
        .expect(400);
      expect(service.set).not.toHaveBeenCalled();
    },
  );

  it('PUT con titular bloqueado responde 409 y no escribe', async () => {
    contractsService.assertContractNotBlocked.mockRejectedValue(
      new ConflictException({ code: 'PRIVACY_DATA_BLOCKED' }),
    );
    await request(app.getHttpServer())
      .put(`/crm/contracts/${CONTRACT_ID}/permanence`)
      .send({ accepted: true })
      .expect(409);
    expect(service.set).not.toHaveBeenCalled();
  });

  it('PUT con rol AUDITOR responde 403', async () => {
    await request(app.getHttpServer())
      .put(`/crm/contracts/${CONTRACT_ID}/permanence`)
      .set('x-test-role', UserRole.AUDITOR)
      .send({ accepted: true })
      .expect(403);
  });

  it('id no UUID responde 400', async () => {
    await request(app.getHttpServer()).get('/crm/contracts/abc/permanence').expect(400);
  });
});
