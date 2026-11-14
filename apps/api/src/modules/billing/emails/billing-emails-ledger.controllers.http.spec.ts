import {
  ExecutionContext,
  HttpException,
  HttpStatus,
  INestApplication,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AccessPermissionKey, BILLING_ERROR_CODES, UserRole } from '@iwana/shared';
import { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { BillingStatementLedgerController } from '../statement/billing-statement-ledger.controller';
import { BillingStatementLedgerService } from '../statement/billing-statement-ledger.service';
import { BillingEmailsController, STATEMENT_SEND_BODY_SCHEMA } from './billing-emails.controller';
import { BillingEmailsService } from './billing-emails.service';

/**
 * Envíos por correo, registro de correos y libro del estado de cuenta por HTTP con los guards
 * reales de rol y permiso (informe MOD05↔MOD14 v1.0, P-04, P-07 y SEC-03).
 */
describe('HTTP correos de Facturación y libro del estado de cuenta', () => {
  const actor = '5e1d47e5-7241-4e63-9684-2b51ecee55ba';
  const subscriberId = '7b3f0a52-1d7e-4d55-9f3c-4b52a1f0c010';
  const documentId = '7b3f0a52-1d7e-4d55-9f3c-4b52a1f0c020';
  const paymentId = '7b3f0a52-1d7e-4d55-9f3c-4b52a1f0c030';
  const entry = { id: '7b3f0a52-1d7e-4d55-9f3c-4b52a1f0c040', status: 'EN_COLA' };
  let app: INestApplication;
  let grants: AccessPermissionKey[];
  const emails = {
    requestDocumentEmail: jest.fn(),
    requestReceiptEmail: jest.fn(),
    requestStatementEmail: jest.fn(),
    emailLog: jest.fn(),
  };
  const ledgers = { ledger: jest.fn(), ledgerPdf: jest.fn() };
  const permissions = { getEffectivePermissionsForUser: jest.fn(async () => grants) };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [BillingEmailsController, BillingStatementLedgerController],
      providers: [
        { provide: BillingEmailsService, useValue: emails },
        { provide: BillingStatementLedgerService, useValue: ledgers },
        { provide: EffectivePermissionsService, useValue: permissions },
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

  const server = () => app.getHttpServer();

  describe('POST billing/documents/:id/send', () => {
    const path = `/api/v1/billing/documents/${documentId}/send`;

    it('exige sesión, rol de facturación y billing.invoices.manage', async () => {
      await request(server()).post(path).expect(401);
      grants = [AccessPermissionKey.BILLING_INVOICES_MANAGE];
      await request(server()).post(path).set('x-test-role', UserRole.SUPPORT).expect(403);
      grants = [AccessPermissionKey.BILLING_INVOICES_READ];
      await request(server()).post(path).set('x-test-role', UserRole.ACCOUNTANT).expect(403);
      expect(emails.requestDocumentEmail).not.toHaveBeenCalled();
    });

    it('responde 202 con la fila del registro', async () => {
      grants = [AccessPermissionKey.BILLING_INVOICES_MANAGE];
      emails.requestDocumentEmail.mockResolvedValue(entry);
      await request(server())
        .post(path)
        .set('x-test-role', UserRole.ACCOUNTANT)
        .expect(202, { data: entry });
      expect(emails.requestDocumentEmail).toHaveBeenCalledWith(documentId, actor);
    });

    it('rechaza un id que no es uuid', async () => {
      grants = [AccessPermissionKey.BILLING_INVOICES_MANAGE];
      await request(server())
        .post('/api/v1/billing/documents/no-es-uuid/send')
        .set('x-test-role', UserRole.ADMIN)
        .expect(400);
      expect(emails.requestDocumentEmail).not.toHaveBeenCalled();
    });

    it.each([
      [
        429,
        new HttpException(
          { code: BILLING_ERROR_CODES.BILLING_EMAIL_RATE_LIMITED, message: 'x' },
          HttpStatus.TOO_MANY_REQUESTS,
        ),
      ],
      [
        503,
        new ServiceUnavailableException({
          code: BILLING_ERROR_CODES.BILLING_EMAIL_QUEUE_UNAVAILABLE,
          message: 'x',
        }),
      ],
    ])('propaga %s del servicio con su código', async (status, error) => {
      grants = [AccessPermissionKey.BILLING_INVOICES_MANAGE];
      emails.requestDocumentEmail.mockRejectedValue(error);
      const response = await request(server())
        .post(path)
        .set('x-test-role', UserRole.ADMIN)
        .expect(status);
      expect(response.body.code).toBe((error.getResponse() as { code: string }).code);
    });
  });

  describe('POST billing/payments/:id/receipt/send', () => {
    const path = `/api/v1/billing/payments/${paymentId}/receipt/send`;

    it('exige billing.payments.register', async () => {
      grants = [AccessPermissionKey.BILLING_PAYMENTS_READ];
      await request(server()).post(path).set('x-test-role', UserRole.SUPPORT).expect(403);
      expect(emails.requestReceiptEmail).not.toHaveBeenCalled();
    });

    it.each([
      [[AccessPermissionKey.PRIVACY_READ], { canSeeBlocked: true, grantedBy: 'PRIVACY_READ' }],
      [
        [AccessPermissionKey.CRM_BLOCKED_DATA_READ],
        { canSeeBlocked: true, grantedBy: 'CRM_BLOCKED_DATA_READ' },
      ],
      [[], { canSeeBlocked: false }],
    ])('con %j pasa el acceso de lectura %j', async (extra, access) => {
      grants = [AccessPermissionKey.BILLING_PAYMENTS_REGISTER, ...extra];
      emails.requestReceiptEmail.mockResolvedValue(entry);
      await request(server())
        .post(path)
        .set('x-test-role', UserRole.SALES)
        .expect(202, { data: entry });
      expect(emails.requestReceiptEmail).toHaveBeenCalledWith(paymentId, actor, {
        actorId: actor,
        ...access,
      });
    });
  });

  describe('POST billing/subscribers/:subscriberId/statement/send', () => {
    const path = `/api/v1/billing/subscribers/${subscriberId}/statement/send`;

    it('P-07: sin cuerpo se acepta como {}', async () => {
      grants = [AccessPermissionKey.BILLING_INVOICES_MANAGE];
      emails.requestStatementEmail.mockResolvedValue(entry);
      await request(server())
        .post(path)
        .set('x-test-role', UserRole.ACCOUNTANT)
        .expect(202, { data: entry });
      expect(emails.requestStatementEmail).toHaveBeenCalledWith(subscriberId, {}, actor);
    });

    it('con cuerpo pasa el periodo validado', async () => {
      grants = [AccessPermissionKey.BILLING_INVOICES_MANAGE];
      emails.requestStatementEmail.mockResolvedValue(entry);
      await request(server())
        .post(path)
        .set('x-test-role', UserRole.ADMIN)
        .send({ from: '2026-10-01', to: '2026-10-31' })
        .expect(202);
      expect(emails.requestStatementEmail).toHaveBeenCalledWith(
        subscriberId,
        { from: '2026-10-01', to: '2026-10-31' },
        actor,
      );
    });

    it.each([
      [{ from: '2026-11-01', to: '2026-10-01' }],
      [{ from: '2026-13-01' }],
      [{ to: '2026-10-01', extra: true }],
    ])('rechaza el periodo inválido %j con 400', async (body) => {
      grants = [AccessPermissionKey.BILLING_INVOICES_MANAGE];
      await request(server()).post(path).set('x-test-role', UserRole.ADMIN).send(body).expect(400);
      expect(emails.requestStatementEmail).not.toHaveBeenCalled();
    });

    it('el esquema del cuerpo trata null y undefined como {}', () => {
      expect(STATEMENT_SEND_BODY_SCHEMA.parse(undefined)).toEqual({});
      expect(STATEMENT_SEND_BODY_SCHEMA.parse(null)).toEqual({});
    });
  });

  describe('GET billing/subscribers/:subscriberId/email-log', () => {
    const path = `/api/v1/billing/subscribers/${subscriberId}/email-log`;
    const log = { subscriberId, entries: [] };

    it('exige billing.invoices.read', async () => {
      grants = [AccessPermissionKey.BILLING_PAYMENTS_READ];
      await request(server()).get(path).set('x-test-role', UserRole.AUDITOR).expect(403);
      expect(emails.emailLog).not.toHaveBeenCalled();
    });

    it('lista recibos solo con billing.payments.read y pasa el acceso a datos bloqueados', async () => {
      grants = [AccessPermissionKey.BILLING_INVOICES_READ];
      emails.emailLog.mockResolvedValue(log);
      await request(server())
        .get(path)
        .set('x-test-role', UserRole.AUDITOR)
        .expect(200, { data: log });
      expect(emails.emailLog).toHaveBeenLastCalledWith(subscriberId, actor, {
        canReadReceipts: false,
        readAccess: { actorId: actor, canSeeBlocked: false },
      });
      grants = [
        AccessPermissionKey.BILLING_INVOICES_READ,
        AccessPermissionKey.BILLING_PAYMENTS_READ,
        AccessPermissionKey.CRM_BLOCKED_DATA_READ,
      ];
      await request(server()).get(path).set('x-test-role', UserRole.SUPPORT).expect(200);
      expect(emails.emailLog).toHaveBeenLastCalledWith(subscriberId, actor, {
        canReadReceipts: true,
        readAccess: { actorId: actor, canSeeBlocked: true, grantedBy: 'CRM_BLOCKED_DATA_READ' },
      });
    });

    it('propaga 404 del servicio', async () => {
      grants = [AccessPermissionKey.BILLING_INVOICES_READ];
      emails.emailLog.mockRejectedValue(
        new NotFoundException({ code: 'BILLING_SUBSCRIBER_NOT_FOUND', message: 'x' }),
      );
      await request(server()).get(path).set('x-test-role', UserRole.ADMIN).expect(404);
    });
  });

  describe('GET billing/subscribers/:subscriberId/statement/ledger', () => {
    const path = `/api/v1/billing/subscribers/${subscriberId}/statement/ledger`;
    const ledger = { subscriberId, rows: [] };

    it('exige sesión y billing.invoices.read', async () => {
      await request(server()).get(path).expect(401);
      grants = [AccessPermissionKey.BILLING_PAYMENTS_READ];
      await request(server()).get(path).set('x-test-role', UserRole.AUDITOR).expect(403);
      expect(ledgers.ledger).not.toHaveBeenCalled();
    });

    it.each([
      [[AccessPermissionKey.PRIVACY_READ], { canSeeBlocked: true, grantedBy: 'PRIVACY_READ' }],
      [
        [AccessPermissionKey.CRM_BLOCKED_DATA_READ],
        { canSeeBlocked: true, grantedBy: 'CRM_BLOCKED_DATA_READ' },
      ],
      [[], { canSeeBlocked: false }],
    ])('con %j pasa el acceso %j y el periodo', async (extra, access) => {
      grants = [AccessPermissionKey.BILLING_INVOICES_READ, ...extra];
      ledgers.ledger.mockResolvedValue(ledger);
      await request(server())
        .get(`${path}?from=2026-10-01&to=2026-10-31`)
        .set('x-test-role', UserRole.SALES)
        .expect(200, { data: ledger });
      expect(ledgers.ledger).toHaveBeenCalledWith(
        subscriberId,
        { from: '2026-10-01', to: '2026-10-31' },
        actor,
        access,
      );
    });

    it('rechaza from posterior a to', async () => {
      grants = [AccessPermissionKey.BILLING_INVOICES_READ];
      await request(server())
        .get(`${path}?from=2026-11-01&to=2026-10-01`)
        .set('x-test-role', UserRole.ADMIN)
        .expect(400);
      expect(ledgers.ledger).not.toHaveBeenCalled();
    });
  });

  describe('GET billing/subscribers/:subscriberId/statement/ledger/pdf', () => {
    const path = `/api/v1/billing/subscribers/${subscriberId}/statement/ledger/pdf`;

    it('entrega el PDF como adjunto sin caché', async () => {
      grants = [AccessPermissionKey.BILLING_INVOICES_READ, AccessPermissionKey.PRIVACY_READ];
      ledgers.ledgerPdf.mockResolvedValue({
        filename: 'estado-de-cuenta-2026-10-31.pdf',
        content: Buffer.from('%PDF-1.3 libro'),
      });
      const response = await request(server())
        .get(`${path}?to=2026-10-31`)
        .set('x-test-role', UserRole.ACCOUNTANT)
        .expect(200);
      expect(response.headers['content-type']).toContain('application/pdf');
      expect(response.headers['content-disposition']).toBe(
        'attachment; filename="estado-de-cuenta-2026-10-31.pdf"',
      );
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(ledgers.ledgerPdf).toHaveBeenCalledWith(subscriberId, { to: '2026-10-31' }, actor, {
        canSeeBlocked: true,
        grantedBy: 'PRIVACY_READ',
      });
    });

    it('exige billing.invoices.read', async () => {
      grants = [];
      await request(server()).get(path).set('x-test-role', UserRole.ADMIN).expect(403);
      expect(ledgers.ledgerPdf).not.toHaveBeenCalled();
    });
  });

  describe('sesión sin sujeto', () => {
    const emailsController = () =>
      new BillingEmailsController(
        emails as unknown as BillingEmailsService,
        permissions as unknown as EffectivePermissionsService,
      );
    const ledgerController = () =>
      new BillingStatementLedgerController(
        ledgers as unknown as BillingStatementLedgerService,
        permissions as unknown as EffectivePermissionsService,
      );

    it('cada ruta responde 401 sin consultar el servicio', async () => {
      const anonymous = {};
      await expect(emailsController().sendDocument(documentId, anonymous)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      await expect(emailsController().sendReceipt(paymentId, anonymous)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      await expect(
        emailsController().sendStatement(subscriberId, {}, anonymous),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(emailsController().emailLog(subscriberId, anonymous)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      await expect(ledgerController().ledger(subscriberId, {}, anonymous)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      await expect(
        ledgerController().ledgerPdf(subscriberId, {}, anonymous, {} as never),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(emails.requestDocumentEmail).not.toHaveBeenCalled();
      expect(ledgers.ledger).not.toHaveBeenCalled();
    });
  });
});
