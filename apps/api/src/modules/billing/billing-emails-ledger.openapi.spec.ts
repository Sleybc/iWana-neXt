import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import request from 'supertest';
import { AccessPermissionKey } from '@iwana/shared';
import { PERMISSIONS_KEY } from '../access-control/decorators/permissions.decorator';
import { EffectivePermissionsService } from '../access-control/services/effective-permissions.service';
import { PermissionsGuard } from '../access-control/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BillingEmailsController } from './emails/billing-emails.controller';
import { BillingEmailsService } from './emails/billing-emails.service';
import { BillingStatementLedgerController } from './statement/billing-statement-ledger.controller';
import { BillingStatementLedgerService } from './statement/billing-statement-ledger.service';

const SUBSCRIBER = '00000000-0000-4000-8000-000000000010';
const ACTOR = '00000000-0000-4000-8000-000000000050';

/** Contrato HTTP del libro y de los envíos (spec MOD05↔MOD14 2026-11-13 D4, D5, D11). */
describe('Libro del estado de cuenta y envíos por correo: OpenAPI y HTTP', () => {
  let app: INestApplication;
  let document: OpenAPIObject;
  const ledgers = {
    ledger: jest.fn().mockResolvedValue({ rows: [] }),
    ledgerPdf: jest.fn().mockResolvedValue({
      filename: 'estado-de-cuenta-2026-11-13.pdf',
      content: Buffer.from('%PDF-1'),
    }),
  };
  const emails = {
    requestDocumentEmail: jest.fn().mockResolvedValue({ id: 'log' }),
    requestReceiptEmail: jest.fn().mockResolvedValue({ id: 'log' }),
    requestStatementEmail: jest.fn().mockResolvedValue({ id: 'log' }),
    emailLog: jest.fn().mockResolvedValue({ subscriberId: SUBSCRIBER, entries: [] }),
  };
  const permissions = { getEffectivePermissionsForUser: jest.fn().mockResolvedValue([]) };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [BillingStatementLedgerController, BillingEmailsController],
      providers: [
        { provide: BillingStatementLedgerService, useValue: ledgers },
        { provide: BillingEmailsService, useValue: emails },
        { provide: EffectivePermissionsService, useValue: permissions },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => { getRequest: () => { user?: unknown } };
        }) => {
          context.switchToHttp().getRequest().user = { sub: ACTOR };
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Billing API').setVersion('1.0').build(),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  it('declara las rutas con su esquema y los errores relevantes', () => {
    const ledger = document.paths['/billing/subscribers/{subscriberId}/statement/ledger']?.get;
    const ledgerSchema = (
      ledger?.responses['200'] as unknown as {
        content: Record<string, { schema: Record<string, unknown> }>;
      }
    ).content['application/json']?.schema;
    expect(JSON.stringify(ledgerSchema)).toContain('SALDO_ANTERIOR');
    expect(Object.keys(ledger?.responses ?? {})).toEqual(
      expect.arrayContaining(['200', '400', '401', '403', '404', '503']),
    );
    expect(ledger?.parameters?.map((p) => (p as { name: string }).name)).toEqual(
      expect.arrayContaining(['subscriberId', 'from', 'to']),
    );
    expect(
      document.paths['/billing/subscribers/{subscriberId}/statement/ledger/pdf']?.get?.responses[
        '200'
      ],
    ).toMatchObject({ content: { 'application/pdf': expect.anything() } });

    for (const path of [
      '/billing/documents/{id}/send',
      '/billing/payments/{id}/receipt/send',
      '/billing/subscribers/{subscriberId}/statement/send',
    ]) {
      const operation = document.paths[path]?.post;
      const accepted = operation?.responses['202'] as unknown as {
        content: Record<string, { schema: Record<string, unknown> }>;
      };
      expect(JSON.stringify(accepted.content['application/json']?.schema)).toContain(
        'TITULAR_RESTRINGIDO',
      );
      expect(operation?.security).toEqual([{ 'access-token': [] }]);
    }
    expect(
      Object.keys(
        document.paths['/billing/subscribers/{subscriberId}/email-log']?.get?.responses ?? {},
      ),
    ).toEqual(expect.arrayContaining(['200', '401', '403', '404', '503']));
  });

  it('exige los permisos de D11 en cada ruta', () => {
    const permissionOf = (handler: unknown) =>
      Reflect.getMetadata(PERMISSIONS_KEY, handler as object);
    const ledgerProto = BillingStatementLedgerController.prototype;
    const emailProto = BillingEmailsController.prototype;
    expect(permissionOf(ledgerProto.ledger)).toEqual([AccessPermissionKey.BILLING_INVOICES_READ]);
    expect(permissionOf(ledgerProto.ledgerPdf)).toEqual([
      AccessPermissionKey.BILLING_INVOICES_READ,
    ]);
    expect(permissionOf(emailProto.sendDocument)).toEqual([
      AccessPermissionKey.BILLING_INVOICES_MANAGE,
    ]);
    expect(permissionOf(emailProto.sendStatement)).toEqual([
      AccessPermissionKey.BILLING_INVOICES_MANAGE,
    ]);
    expect(permissionOf(emailProto.sendReceipt)).toEqual([
      AccessPermissionKey.BILLING_PAYMENTS_REGISTER,
    ]);
    expect(permissionOf(emailProto.emailLog)).toEqual([AccessPermissionKey.BILLING_INVOICES_READ]);
  });

  it('valida el periodo del libro con fechas civiles y from <= to', async () => {
    for (const query of [
      'from=2026-02-30',
      'to=13-11-2026',
      'from=2026-05-01&to=2026-04-01',
      'otro=1',
    ])
      await request(app.getHttpServer())
        .get(`/billing/subscribers/${SUBSCRIBER}/statement/ledger?${query}`)
        .expect(400);
    await request(app.getHttpServer())
      .get(`/billing/subscribers/no-uuid/statement/ledger`)
      .expect(400);
    expect(ledgers.ledger).not.toHaveBeenCalled();

    permissions.getEffectivePermissionsForUser.mockResolvedValueOnce([
      AccessPermissionKey.CRM_BLOCKED_DATA_READ,
    ]);
    await request(app.getHttpServer())
      .get(`/billing/subscribers/${SUBSCRIBER}/statement/ledger?from=2026-01-01&to=2026-03-31`)
      .expect(200);
    expect(ledgers.ledger).toHaveBeenCalledWith(
      SUBSCRIBER,
      { from: '2026-01-01', to: '2026-03-31' },
      ACTOR,
      { canSeeBlocked: true, grantedBy: 'CRM_BLOCKED_DATA_READ' },
    );
  });

  it('entrega el PDF del libro sin caché', async () => {
    const response = await request(app.getHttpServer())
      .get(`/billing/subscribers/${SUBSCRIBER}/statement/ledger/pdf`)
      .expect(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="estado-de-cuenta-2026-11-13.pdf"',
    );
    expect(ledgers.ledgerPdf).toHaveBeenCalledWith(SUBSCRIBER, {}, ACTOR, { canSeeBlocked: false });
  });

  it('los envíos responden 202 y el del estado de cuenta valida su periodo', async () => {
    await request(app.getHttpServer()).post(`/billing/documents/${SUBSCRIBER}/send`).expect(202);
    await request(app.getHttpServer())
      .post(`/billing/payments/${SUBSCRIBER}/receipt/send`)
      .expect(202);
    expect(emails.requestReceiptEmail).toHaveBeenCalledWith(SUBSCRIBER, ACTOR, {
      actorId: ACTOR,
      canSeeBlocked: false,
    });
    await request(app.getHttpServer())
      .post(`/billing/subscribers/${SUBSCRIBER}/statement/send`)
      .send({ from: '2026-05-01', to: '2026-04-01' })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/billing/subscribers/${SUBSCRIBER}/statement/send`)
      .send({ to: '2026-04-01', email: 'otro@ejemplo.test' })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/billing/subscribers/${SUBSCRIBER}/statement/send`)
      .send({ to: '2026-04-01' })
      .expect(202);
    expect(emails.requestStatementEmail).toHaveBeenCalledWith(
      SUBSCRIBER,
      { to: '2026-04-01' },
      ACTOR,
    );
  });

  it('el registro pide los recibos solo con billing.payments.read', async () => {
    permissions.getEffectivePermissionsForUser.mockResolvedValueOnce([
      AccessPermissionKey.BILLING_PAYMENTS_READ,
    ]);
    await request(app.getHttpServer())
      .get(`/billing/subscribers/${SUBSCRIBER}/email-log`)
      .expect(200);
    expect(emails.emailLog).toHaveBeenLastCalledWith(SUBSCRIBER, ACTOR, {
      canReadReceipts: true,
      readAccess: { actorId: ACTOR, canSeeBlocked: false },
    });
    await request(app.getHttpServer())
      .get(`/billing/subscribers/${SUBSCRIBER}/email-log`)
      .expect(200);
    expect(emails.emailLog).toHaveBeenLastCalledWith(SUBSCRIBER, ACTOR, {
      canReadReceipts: false,
      readAccess: { actorId: ACTOR, canSeeBlocked: false },
    });
  });
});
