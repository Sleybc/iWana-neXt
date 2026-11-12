import { ExecutionContext, INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AccessPermissionKey, UserRole, type BillingCourtesyResponse } from '@iwana/shared';
import { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { BillingCourtesiesController } from './billing-courtesies.controller';
import { BillingCourtesiesService } from './billing-courtesies.service';

/** CA-4 (spec MOD14 2026-11-12): sin permiso de cortesías la API responde 403. */
describe('HTTP cortesías de facturación', () => {
  const base = '/api/v1/billing';
  const documentId = '5e1d47e5-7241-4e63-9684-2b51ecee55ba';
  const courtesyId = '6f2e58f6-8352-4f74-a795-3c62fdff66cb';
  const actor = '7a3f69a7-9463-4085-b8a6-4d73ae0077dc';
  let app: INestApplication;
  let grants: AccessPermissionKey[];
  const service = { grant: jest.fn(), void: jest.fn() };

  const courtesy: BillingCourtesyResponse = {
    id: courtesyId,
    documentId,
    subscriberId: actor,
    application: 'AJUSTE_SOBRE_EMITIDO',
    target: 'VALOR',
    sourceLineId: null,
    lineId: null,
    amount: '3548.39',
    reasonCode: 'PRORRATEO_INICIAL',
    note: null,
    status: 'ACTIVA',
    voidReasonCode: null,
    voidNote: null,
    voidedAt: null,
    voidedBy: null,
    createdBy: actor,
    createdAt: '2026-11-12T00:00:00.000Z',
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [BillingCourtesiesController],
      providers: [
        { provide: BillingCourtesiesService, useValue: service },
        {
          provide: EffectivePermissionsService,
          useValue: { getEffectivePermissionsForUser: async () => grants },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          const req = context
            .switchToHttp()
            .getRequest<{ headers: Record<string, string>; user: unknown }>();
          const role = req.headers['x-test-role'];
          if (!role) throw new UnauthorizedException();
          req.user = { sub: actor, role, type: 'tenant' };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  beforeEach(() => {
    grants = [];
    service.grant.mockReset().mockResolvedValue(courtesy);
    service.void.mockReset().mockResolvedValue({ ...courtesy, status: 'ANULADA' });
  });

  afterAll(async () => {
    await app?.close();
  });

  const grantBody = { target: 'VALOR', amount: '3548.39', reasonCode: 'PRORRATEO_INICIAL' };

  it('sin sesión responde 401', async () => {
    await request(app.getHttpServer())
      .post(`${base}/documents/${documentId}/courtesies`)
      .send(grantBody)
      .expect(401);
  });

  it.each([
    [UserRole.ADMIN, [AccessPermissionKey.BILLING_INVOICES_MANAGE]],
    [UserRole.ACCOUNTANT, [AccessPermissionKey.BILLING_PAYMENTS_REGISTER]],
  ])('CA-4: %s sin billing.courtesies.manage recibe 403 y no toca el servicio', async (role, g) => {
    grants = g;
    await request(app.getHttpServer())
      .post(`${base}/documents/${documentId}/courtesies`)
      .set('x-test-role', role)
      .send(grantBody)
      .expect(403);
    await request(app.getHttpServer())
      .post(`${base}/courtesies/${courtesyId}/void`)
      .set('x-test-role', role)
      .send({ reasonCode: 'ERROR_DE_REGISTRO' })
      .expect(403);
    expect(service.grant).not.toHaveBeenCalled();
    expect(service.void).not.toHaveBeenCalled();
  });

  it.each([UserRole.SUPPORT, UserRole.SALES, UserRole.AUDITOR])(
    'CA-4: el rol %s recibe 403 aunque tuviera el permiso',
    async (role) => {
      grants = [AccessPermissionKey.BILLING_COURTESIES_MANAGE];
      await request(app.getHttpServer())
        .post(`${base}/documents/${documentId}/courtesies`)
        .set('x-test-role', role)
        .send(grantBody)
        .expect(403);
      expect(service.grant).not.toHaveBeenCalled();
    },
  );

  it.each([UserRole.ADMIN, UserRole.ACCOUNTANT])(
    '%s con el permiso otorga (201) y anula (200) con el actor del JWT',
    async (role) => {
      grants = [AccessPermissionKey.BILLING_COURTESIES_MANAGE];
      const created = await request(app.getHttpServer())
        .post(`${base}/documents/${documentId}/courtesies`)
        .set('x-test-role', role)
        .set('Idempotency-Key', 'otorgar-1')
        .send(grantBody)
        .expect(201);
      expect(created.body).toEqual({ data: courtesy });
      expect(service.grant).toHaveBeenCalledWith(documentId, grantBody, actor, 'otorgar-1');
      await request(app.getHttpServer())
        .post(`${base}/courtesies/${courtesyId}/void`)
        .set('x-test-role', role)
        .set('Idempotency-Key', 'anular-1')
        .send({ reasonCode: 'DECISION_REVERTIDA', note: 'Revisión del caso' })
        .expect(200);
      expect(service.void).toHaveBeenCalledWith(
        courtesyId,
        { reasonCode: 'DECISION_REVERTIDA', note: 'Revisión del caso' },
        actor,
        'anular-1',
      );
    },
  );

  it.each([
    [{ target: 'VALOR', reasonCode: 'PRORRATEO_INICIAL' }, 'sin valor'],
    [{ target: 'LINEA', reasonCode: 'PRORRATEO_INICIAL' }, 'sin línea'],
    [{ ...grantBody, reasonCode: 'OTRO' }, 'OTRO sin nota'],
    [{ ...grantBody, reasonCode: 'INVENTADO' }, 'motivo fuera de catálogo'],
    [{ ...grantBody, amount: '-1.00' }, 'valor negativo'],
    [{ ...grantBody, tenantId: documentId }, 'campo extra'],
  ])('rechaza un cuerpo inválido (%j, %s)', async (body, _label) => {
    grants = [AccessPermissionKey.BILLING_COURTESIES_MANAGE];
    await request(app.getHttpServer())
      .post(`${base}/documents/${documentId}/courtesies`)
      .set('x-test-role', UserRole.ADMIN)
      .send(body)
      .expect(400);
    expect(service.grant).not.toHaveBeenCalled();
  });

  it('rechaza un id que no es uuid', async () => {
    grants = [AccessPermissionKey.BILLING_COURTESIES_MANAGE];
    await request(app.getHttpServer())
      .post(`${base}/courtesies/no-es-uuid/void`)
      .set('x-test-role', UserRole.ADMIN)
      .send({ reasonCode: 'ERROR_DE_REGISTRO' })
      .expect(400);
  });
});
