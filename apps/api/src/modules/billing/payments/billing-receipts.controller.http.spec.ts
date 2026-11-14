import {
  ConflictException,
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AccessPermissionKey, UserRole } from '@iwana/shared';
import { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { BillingPaymentsController } from './billing-payments.controller';
import { BillingPaymentsService } from './billing-payments.service';
import { BillingReceiptsService } from './billing-receipts.service';

/** Spec MOD05↔MOD14 2026-11-13 D11: desasociar y recibo PDF por HTTP, con guards reales. */
describe('HTTP desasociar pago y recibo PDF', () => {
  const base = '/api/v1/billing/payments';
  const actor = '5e1d47e5-7241-4e63-9684-2b51ecee55ba';
  const paymentId = '7b3f0a52-1d7e-4d55-9f3c-4b52a1f0c001';
  const allocationId = '7b3f0a52-1d7e-4d55-9f3c-4b52a1f0c002';
  let app: INestApplication;
  let grants: AccessPermissionKey[];
  const payments = { unlinkAllocation: jest.fn() };
  const receipts = { receiptPdf: jest.fn() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [BillingPaymentsController],
      providers: [
        { provide: BillingPaymentsService, useValue: payments },
        { provide: BillingReceiptsService, useValue: receipts },
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
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('POST payments/:id/allocations/:allocationId/unlink', () => {
    const path = `${base}/${paymentId}/allocations/${allocationId}/unlink`;

    it('exige sesión y billing.payments.register', async () => {
      await request(app.getHttpServer()).post(path).expect(401);
      grants = [AccessPermissionKey.BILLING_PAYMENTS_READ];
      await request(app.getHttpServer())
        .post(path)
        .set('x-test-role', UserRole.ACCOUNTANT)
        .send({ reasonCode: 'REASIGNACION' })
        .expect(403);
      expect(payments.unlinkAllocation).not.toHaveBeenCalled();
    });

    it('responde 200 con el pago y pasa ids, cuerpo, actor y acceso de lectura', async () => {
      grants = [AccessPermissionKey.BILLING_PAYMENTS_REGISTER, AccessPermissionKey.PRIVACY_READ];
      payments.unlinkAllocation.mockResolvedValue({ id: paymentId, unallocatedAmount: '10.00' });
      await request(app.getHttpServer())
        .post(path)
        .set('x-test-role', UserRole.ACCOUNTANT)
        .send({ reasonCode: 'REASIGNACION' })
        .expect(200, { data: { id: paymentId, unallocatedAmount: '10.00' } });
      expect(payments.unlinkAllocation).toHaveBeenCalledWith(
        paymentId,
        allocationId,
        { reasonCode: 'REASIGNACION' },
        actor,
        { actorId: actor, canSeeBlocked: true, grantedBy: 'PRIVACY_READ' },
      );
    });

    it('rechaza identificadores que no son uuid', async () => {
      grants = [AccessPermissionKey.BILLING_PAYMENTS_REGISTER];
      await request(app.getHttpServer())
        .post(`${base}/${paymentId}/allocations/no-es-uuid/unlink`)
        .set('x-test-role', UserRole.ADMIN)
        .send({ reasonCode: 'REASIGNACION' })
        .expect(400);
      expect(payments.unlinkAllocation).not.toHaveBeenCalled();
    });

    it.each([
      [409, new ConflictException({ code: 'BILLING_ALLOCATION_NOT_UNLINKABLE', message: 'x' })],
      [
        422,
        new UnprocessableEntityException({
          code: 'BILLING_ALLOCATION_HAS_WITHHOLDING',
          message: 'x',
        }),
      ],
    ])('propaga el rechazo %s del servicio', async (status, error) => {
      grants = [AccessPermissionKey.BILLING_PAYMENTS_REGISTER];
      payments.unlinkAllocation.mockRejectedValue(error);
      await request(app.getHttpServer())
        .post(path)
        .set('x-test-role', UserRole.ACCOUNTANT)
        .send({ reasonCode: 'VALOR_EQUIVOCADO' })
        .expect(status);
    });
  });

  describe('GET payments/:id/receipt/pdf', () => {
    const path = `${base}/${paymentId}/receipt/pdf`;

    it('exige sesión y billing.payments.read', async () => {
      await request(app.getHttpServer()).get(path).expect(401);
      grants = [AccessPermissionKey.BILLING_PAYMENTS_REGISTER];
      await request(app.getHttpServer())
        .get(path)
        .set('x-test-role', UserRole.ACCOUNTANT)
        .expect(403);
      expect(receipts.receiptPdf).not.toHaveBeenCalled();
    });

    it('entrega el PDF como adjunto recibo-<n>.pdf sin caché', async () => {
      grants = [AccessPermissionKey.BILLING_PAYMENTS_READ];
      receipts.receiptPdf.mockResolvedValue({
        filename: 'recibo-12.pdf',
        content: Buffer.from('%PDF-1.3 recibo'),
        receiptNumber: 12,
      });
      const response = await request(app.getHttpServer())
        .get(path)
        .set('x-test-role', UserRole.AUDITOR)
        .expect(200);
      expect(response.headers['content-type']).toContain('application/pdf');
      expect(response.headers['content-disposition']).toBe('attachment; filename="recibo-12.pdf"');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(receipts.receiptPdf).toHaveBeenCalledWith(paymentId, {
        actorId: actor,
        canSeeBlocked: false,
      });
    });

    it('propaga 409 BILLING_RECEIPT_NOT_AVAILABLE de un pago importado', async () => {
      grants = [AccessPermissionKey.BILLING_PAYMENTS_READ];
      receipts.receiptPdf.mockRejectedValue(
        new ConflictException({ code: 'BILLING_RECEIPT_NOT_AVAILABLE', message: 'x' }),
      );
      await request(app.getHttpServer())
        .get(path)
        .set('x-test-role', UserRole.ADMIN)
        .expect(409)
        .expect(({ body }) => expect(body.code).toBe('BILLING_RECEIPT_NOT_AVAILABLE'));
    });
  });
});
