import { ExecutionContext, INestApplication, UnauthorizedException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import request from 'supertest';
import { AccessPermissionKey, UserRole } from '@iwana/shared';
import { buildPageMeta } from '../../common/pagination';
import { EffectivePermissionsService } from '../access-control/services/effective-permissions.service';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IPrivacyMarksReadPort } from '../privacy/ports/privacy-marks-read.port';
import { SettingsPriorityTenantReadPort } from '../tenant/ports/settings-priority-tenant-read.port';
import { BillingPaymentsController } from './payments/billing-payments.controller';
import { BillingPaymentsService } from './payments/billing-payments.service';
import { BillingPolicyController } from './policy/billing-policy.controller';
import { BillingPolicyService } from './policy/billing-policy.service';
import { BillingContractReadPort } from './ports/billing-contract-read.port';

describe('BR-5 HTTP pagos y política de facturación', () => {
  const base = '/api/v1/billing';
  const id = '5e1d47e5-7241-4e63-9684-2b51ecee55ba';
  let app: INestApplication;
  let payments: BillingPaymentsService;
  let grants: AccessPermissionKey[];

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [BillingPaymentsController, BillingPolicyController],
      providers: [
        BillingPaymentsService,
        BillingPolicyService,
        ...[
          getDataSourceToken(),
          AuditService,
          EventEmitter2,
          BillingContractReadPort,
          IPrivacyMarksReadPort,
          SettingsPriorityTenantReadPort,
        ].map((provide) => ({ provide, useValue: {} })),
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
          req.user = { sub: id, role, type: 'tenant' };
          return true;
        },
      })
      .compile();
    payments = module.get(BillingPaymentsService);
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  beforeEach(() => {
    grants = [];
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each(['payments', 'policy'])('exige sesión y permiso para leer %s', async (path) => {
    await request(app.getHttpServer()).get(`${base}/${path}`).expect(401);
    await request(app.getHttpServer())
      .get(`${base}/${path}`)
      .set('x-test-role', UserRole.ADMIN)
      .expect(403);
  });

  it('separa permisos de lectura y registro de pagos', async () => {
    grants = [AccessPermissionKey.BILLING_PAYMENTS_READ];
    await request(app.getHttpServer())
      .post(`${base}/payments`)
      .set('x-test-role', UserRole.ACCOUNTANT)
      .expect(403);
    grants = [AccessPermissionKey.BILLING_PAYMENTS_REGISTER];
    await request(app.getHttpServer())
      .get(`${base}/payments/${id}`)
      .set('x-test-role', UserRole.ACCOUNTANT)
      .expect(403);
  });

  it('devuelve la lista de pagos con el envelope ADR-065', async () => {
    grants = [AccessPermissionKey.BILLING_PAYMENTS_READ];
    const list = { data: [], meta: buildPageMeta({ page: 2, limit: 10, total: 21 }) };
    const listPayments = jest.spyOn(payments, 'listPayments').mockResolvedValue(list);
    await request(app.getHttpServer())
      .get(`${base}/payments?page=2&limit=10`)
      .set('x-test-role', UserRole.AUDITOR)
      .expect(200, list);
    expect(listPayments).toHaveBeenCalledWith(
      { page: 2, limit: 10 },
      expect.objectContaining({ canSeeBlocked: false }),
    );
  });

  it.each(['payments?limit=101', 'payments?page=0', 'payments/no-es-uuid'])(
    'rechaza parámetros inválidos de %s',
    async (path) => {
      grants = [AccessPermissionKey.BILLING_PAYMENTS_READ];
      await request(app.getHttpServer())
        .get(`${base}/${path}`)
        .set('x-test-role', UserRole.ADMIN)
        .expect(400);
    },
  );

  it('exige la clave de idempotencia antes de registrar un pago', async () => {
    grants = [AccessPermissionKey.BILLING_PAYMENTS_REGISTER];
    await request(app.getHttpServer())
      .post(`${base}/payments`)
      .set('x-test-role', UserRole.ACCOUNTANT)
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe('IDEMPOTENCY_KEY_REQUIRED'));
  });

  it.each(['payments', `payments/${id}/allocations`, `payments/${id}/void`])(
    'valida el cuerpo de %s con el servicio real',
    async (path) => {
      grants = [AccessPermissionKey.BILLING_PAYMENTS_REGISTER];
      await request(app.getHttpServer())
        .post(`${base}/${path}`)
        .set('x-test-role', UserRole.ACCOUNTANT)
        .set('Idempotency-Key', 'br5-fixture')
        .send({})
        .expect(422)
        .expect(({ body }) => expect(body.code).toBe('VALIDATION_ERROR'));
    },
  );

  it.each(['policy', `contracts/${id}/policy`])(
    'exige rol administrador y permiso de gestión para editar %s',
    async (path) => {
      grants = [AccessPermissionKey.BILLING_INVOICES_READ];
      await request(app.getHttpServer())
        .put(`${base}/${path}`)
        .set('x-test-role', UserRole.ADMIN)
        .expect(403);
      grants = [AccessPermissionKey.BILLING_POLICY_MANAGE];
      await request(app.getHttpServer())
        .put(`${base}/${path}`)
        .set('x-test-role', UserRole.ACCOUNTANT)
        .expect(403);
      await request(app.getHttpServer())
        .put(`${base}/${path}`)
        .set('x-test-role', UserRole.ADMIN)
        .send({ campoDesconocido: true })
        .expect(400)
        .expect(({ body }) => expect(body.code).toBe('VALIDATION_ERROR'));
    },
  );

  it('valida el identificador del contrato y el cuerpo de la vista previa', async () => {
    grants = [AccessPermissionKey.BILLING_INVOICES_READ];
    await request(app.getHttpServer())
      .get(`${base}/contracts/no-es-uuid/policy`)
      .set('x-test-role', UserRole.ADMIN)
      .expect(400);
    await request(app.getHttpServer())
      .post(`${base}/policy/preview`)
      .set('x-test-role', UserRole.ACCOUNTANT)
      .send({ policy: { generationLeadDays: 16 } })
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe('VALIDATION_ERROR'));
  });
});
