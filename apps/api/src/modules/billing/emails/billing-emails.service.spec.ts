import { ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import type { DataSource } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { IPrivacyMarksReadPort } from '../../privacy/ports/privacy-marks-read.port';
import { BillingDocumentsService } from '../documents/billing-documents.service';
import { BillingPaymentsService } from '../payments/billing-payments.service';
import { BillingIssuerReadPort } from '../ports/billing-issuer-read.port';
import { BillingTitularContactReadPort } from '../ports/billing-titular-contact-read.port';
import {
  BILLING_EMAIL_MAX_PER_SUBSCRIBER_HOUR_DEFAULT,
  BillingEmailsService,
  resolveBillingEmailHourlyLimit,
  type BillingEmailLogRow,
} from './billing-emails.service';

const TENANT = '00000000-0000-4000-8000-000000000001';
const SUBSCRIBER = '00000000-0000-4000-8000-000000000010';
const DOCUMENT = '00000000-0000-4000-8000-000000000020';
const PAYMENT = '00000000-0000-4000-8000-000000000030';
const PARTY = '00000000-0000-4000-8000-000000000040';
const ACTOR = '00000000-0000-4000-8000-000000000050';
const LOG = '00000000-0000-4000-8000-000000000060';
const EMAIL = 'titular@ejemplo.test';

const mockRun = jest.fn();
jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    TenantContext: {
      getOrThrow: () => ({ tenantId: TENANT, schemaName: 'tenant_test', tenantSlug: 'acme' }),
    },
    runInTenantSchema: (...args: unknown[]) => mockRun(...args),
  };
});

function logRow(overrides: Partial<BillingEmailLogRow> = {}): BillingEmailLogRow {
  return {
    id: LOG,
    subscriber_id: SUBSCRIBER,
    kind: 'FACTURA',
    document_id: DOCUMENT,
    payment_id: null,
    period_from: null,
    period_to: null,
    recipient_masked: 't***@e***.test',
    subject: 'Factura N.º DC-1 · ISP',
    status: 'EN_COLA',
    reason_code: null,
    resend: false,
    requested_by: ACTOR,
    created_at: new Date('2026-11-13T15:00:00.000Z'),
    processed_at: null,
    ...overrides,
  };
}

describe('BillingEmailsService', () => {
  let query: jest.Mock;
  let queue: { add: jest.Mock };
  let titulars: { findTitularEmail: jest.Mock };
  let marks: { activeMarks: jest.Mock };
  let documents: { findOne: jest.Mock };
  let payments: { getPayment: jest.Mock };
  let audit: { logWithin: jest.Mock };
  let service: BillingEmailsService;
  /** Filas existentes por estado que devuelve la búsqueda por destino. */
  let existing: Partial<Record<'EN_COLA' | 'ENVIADO' | 'RECHAZADO', BillingEmailLogRow>>;
  /** Resultado de `pg_try_advisory_xact_lock` (SEC-EM-01). */
  let lockAcquired: boolean;

  beforeEach(() => {
    existing = {};
    lockAcquired = true;
    query = jest.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes('pg_try_advisory_xact_lock')) return [{ locked: lockAcquired }];
      if (sql.includes('INSERT INTO billing_email_log')) {
        return [
          logRow({
            kind: params[1] as BillingEmailLogRow['kind'],
            document_id: params[3] as string | null,
            payment_id: params[4] as string | null,
            period_from: params[5] as string | null,
            period_to: params[6] as string | null,
            status: params[7] as BillingEmailLogRow['status'],
            reason_code: params[8] as BillingEmailLogRow['reason_code'],
            recipient_masked: params[9] as string | null,
            subject: params[10] as string,
            resend: params[11] as boolean,
          }),
        ];
      }
      if (sql.includes('FROM billing_email_log') && sql.includes('status = $8')) {
        const row = existing[params[7] as 'EN_COLA' | 'ENVIADO' | 'RECHAZADO'];
        return row ? [row] : [];
      }
      return [];
    });
    mockRun.mockReset();
    mockRun.mockImplementation((_ds, _schema, work: (qr: unknown) => unknown) =>
      work({ query, manager: { query } }),
    );
    queue = { add: jest.fn().mockResolvedValue(undefined) };
    titulars = {
      findTitularEmail: jest
        .fn()
        .mockResolvedValue({ exists: true, anonymized: false, partyId: PARTY, email: EMAIL }),
    };
    marks = { activeMarks: jest.fn().mockResolvedValue({}) };
    documents = {
      findOne: jest.fn().mockResolvedValue({
        id: DOCUMENT,
        subscriberId: SUBSCRIBER,
        status: 'EMITIDO',
        number: 'DC-1',
      }),
    };
    payments = {
      getPayment: jest.fn().mockResolvedValue({
        id: PAYMENT,
        subscriberId: SUBSCRIBER,
        status: 'REGISTRADO',
        receiptNumber: 15,
      }),
    };
    audit = { logWithin: jest.fn().mockResolvedValue(undefined) };
    service = new BillingEmailsService(
      {} as DataSource,
      queue as unknown as Queue,
      titulars as unknown as BillingTitularContactReadPort,
      marks as unknown as IPrivacyMarksReadPort,
      documents as unknown as BillingDocumentsService,
      payments as unknown as BillingPaymentsService,
      {
        getIssuerIdentity: jest
          .fn()
          .mockResolvedValue({ legalName: 'ISP', nit: null, verificationDigit: null }),
      } as unknown as BillingIssuerReadPort,
      audit as unknown as AuditService,
    );
  });

  const insertParams = () =>
    query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO billing_email_log'))?.[1] as
      | unknown[]
      | undefined;

  it('encola el documento emitido con payload de solo ids y destinatario enmascarado', async () => {
    const entry = await service.requestDocumentEmail(DOCUMENT, ACTOR);

    expect(entry).toMatchObject({
      kind: 'FACTURA',
      status: 'EN_COLA',
      documentId: DOCUMENT,
      recipientMasked: 't***@e***.test',
      resend: false,
      subject: 'Factura N.º DC-1 · ISP',
    });
    expect(queue.add).toHaveBeenCalledWith(
      'billing-email-send',
      { tenantId: TENANT, tenantSlug: 'acme', schemaName: 'tenant_test', logId: LOG },
      expect.objectContaining({ jobId: `billing-email-${LOG}`, attempts: 5 }),
    );
    expect(JSON.stringify(query.mock.calls)).not.toContain(EMAIL);
    expect(JSON.stringify(audit.logWithin.mock.calls)).not.toContain(EMAIL);
    expect(audit.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE', entityType: 'BillingEmail', entityId: LOG }),
      expect.anything(),
    );
  });

  it('devuelve el envío EN_COLA del mismo destino sin crear otro (idempotencia)', async () => {
    existing.EN_COLA = logRow();
    const entry = await service.requestDocumentEmail(DOCUMENT, ACTOR);
    expect(entry.id).toBe(LOG);
    expect(insertParams()).toBeUndefined();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('marca resend si el mismo destino ya se envió', async () => {
    existing.ENVIADO = logRow({ status: 'ENVIADO' });
    const entry = await service.requestDocumentEmail(DOCUMENT, ACTOR);
    expect(entry.resend).toBe(true);
    expect(queue.add).toHaveBeenCalled();
  });

  it('carrera con el índice único: devuelve la fila EN_COLA que ganó', async () => {
    let first = true;
    mockRun.mockImplementation(async (_ds, _schema, work: (qr: unknown) => unknown) => {
      if (first) {
        first = false;
        throw Object.assign(new Error('duplicate'), { code: '23505' });
      }
      existing.EN_COLA = logRow({ id: '00000000-0000-4000-8000-000000000061' });
      return work({ query, manager: { query } });
    });
    const entry = await service.requestDocumentEmail(DOCUMENT, ACTOR);
    expect(entry.id).toBe('00000000-0000-4000-8000-000000000061');
    expect(queue.add).not.toHaveBeenCalled();
  });

  it.each([
    [
      'con DATOS_BLOQUEADOS',
      { exists: true, anonymized: false, partyId: PARTY, email: EMAIL },
      { [PARTY]: ['DATOS_BLOQUEADOS'] },
      'TITULAR_RESTRINGIDO',
    ],
    [
      'anonimizado',
      { exists: true, anonymized: true, partyId: null, email: null },
      {},
      'TITULAR_RESTRINGIDO',
    ],
    [
      'sin correo',
      { exists: true, anonymized: false, partyId: PARTY, email: null },
      {},
      'SIN_CORREO',
    ],
  ])(
    'titular %s: queda RECHAZADO sin destinatario y no se encola (CA-6)',
    async (_label, titular, activeMarks, reason) => {
      titulars.findTitularEmail.mockResolvedValue(titular);
      marks.activeMarks.mockResolvedValue(activeMarks);
      const entry = await service.requestDocumentEmail(DOCUMENT, ACTOR);
      expect(entry).toMatchObject({
        status: 'RECHAZADO',
        reasonCode: reason,
        recipientMasked: null,
      });
      expect(insertParams()?.[13]).toBe(true);
      expect(queue.add).not.toHaveBeenCalled();
    },
  );

  it('no envía un importado ni un documento sin emitir', async () => {
    documents.findOne.mockResolvedValueOnce({
      id: DOCUMENT,
      subscriberId: SUBSCRIBER,
      status: 'IMPORTADO',
    });
    await expect(service.requestDocumentEmail(DOCUMENT, ACTOR)).rejects.toMatchObject({
      response: { code: 'BILLING_EMAIL_IMPORTED_NOT_SENDABLE' },
    });
    documents.findOne.mockResolvedValueOnce({
      id: DOCUMENT,
      subscriberId: SUBSCRIBER,
      status: 'ANULADO',
    });
    await expect(service.requestDocumentEmail(DOCUMENT, ACTOR)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(insertParams()).toBeUndefined();
  });

  it('recibo: usa el consecutivo en el asunto y rechaza un pago anulado', async () => {
    const entry = await service.requestReceiptEmail(PAYMENT, ACTOR, { canSeeBlocked: false });
    expect(entry).toMatchObject({ kind: 'RECIBO', paymentId: PAYMENT, documentId: null });
    expect(entry.subject).toBe('Recibo de pago N.º 15 · ISP');
    payments.getPayment.mockResolvedValueOnce({
      id: PAYMENT,
      subscriberId: SUBSCRIBER,
      status: 'ANULADO',
    });
    await expect(
      service.requestReceiptEmail(PAYMENT, ACTOR, { canSeeBlocked: false }),
    ).rejects.toMatchObject({ response: { code: 'BILLING_PAYMENT_VOIDED' } });
  });

  it('un pago importado (sin consecutivo) no tiene recibo que enviar', async () => {
    payments.getPayment.mockResolvedValueOnce({
      id: PAYMENT,
      subscriberId: SUBSCRIBER,
      status: 'REGISTRADO',
      receiptNumber: null,
    });
    await expect(
      service.requestReceiptEmail(PAYMENT, ACTOR, { canSeeBlocked: false }),
    ).rejects.toMatchObject({ response: { code: 'BILLING_RECEIPT_NOT_AVAILABLE' } });
    expect(insertParams()).toBeUndefined();
  });

  it('estado de cuenta: el periodo es parte del destino', async () => {
    const entry = await service.requestStatementEmail(
      SUBSCRIBER,
      { from: '2026-01-01', to: '2026-03-31' },
      ACTOR,
    );
    expect(entry).toMatchObject({
      kind: 'ESTADO_CUENTA',
      periodFrom: '2026-01-01',
      periodTo: '2026-03-31',
    });
    const lookup = query.mock.calls.find(([sql]) => String(sql).includes('status = $8'));
    expect(lookup?.[1]).toEqual([
      TENANT,
      'ESTADO_CUENTA',
      SUBSCRIBER,
      null,
      null,
      '2026-01-01',
      '2026-03-31',
      'EN_COLA',
    ]);
  });

  it('404 si el titular no existe; 503 si no se pueden leer sus marcas', async () => {
    titulars.findTitularEmail.mockResolvedValueOnce({
      exists: false,
      anonymized: false,
      partyId: null,
      email: null,
    });
    await expect(service.requestStatementEmail(SUBSCRIBER, {}, ACTOR)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    marks.activeMarks.mockRejectedValueOnce(new Error('privacy down'));
    await expect(service.requestStatementEmail(SUBSCRIBER, {}, ACTOR)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('si la cola no responde, la fila pasa a ERROR para no bloquear el destino', async () => {
    queue.add.mockRejectedValueOnce(new Error('redis down'));
    await expect(service.requestDocumentEmail(DOCUMENT, ACTOR)).rejects.toMatchObject({
      response: { code: 'BILLING_EMAIL_QUEUE_UNAVAILABLE' },
    });
    const update = query.mock.calls.find(([sql]) => String(sql).includes("SET status = 'ERROR'"));
    expect(update?.[1]).toEqual([TENANT, LOG]);
  });

  describe('registro de correos', () => {
    beforeEach(() => {
      query.mockImplementation(async () => [
        logRow({ status: 'ENVIADO', processed_at: new Date('2026-11-13T15:01:00.000Z') }),
      ]);
    });

    it('sin billing.payments.read no lista recibos', async () => {
      await service.emailLog(SUBSCRIBER, ACTOR, {
        canReadReceipts: false,
        readAccess: { canSeeBlocked: false },
      });
      expect(query.mock.calls[0]?.[1]).toEqual([TENANT, SUBSCRIBER, ['FACTURA', 'ESTADO_CUENTA']]);
    });

    it('titular bloqueado y lector sin permiso: oculta el destinatario', async () => {
      marks.activeMarks.mockResolvedValue({ [PARTY]: ['DATOS_BLOQUEADOS'] });
      const log = await service.emailLog(SUBSCRIBER, ACTOR, {
        canReadReceipts: true,
        readAccess: { canSeeBlocked: false },
      });
      expect(log.entries[0]).toMatchObject({ status: 'ENVIADO', recipientMasked: null });
      expect(query.mock.calls[0]?.[1]).toEqual([
        TENANT,
        SUBSCRIBER,
        ['FACTURA', 'RECIBO', 'ESTADO_CUENTA'],
      ]);
      expect(audit.logWithin).not.toHaveBeenCalled();
    });

    it('titular bloqueado y lector con permiso: muestra y audita el acceso', async () => {
      marks.activeMarks.mockResolvedValue({ [PARTY]: ['DATOS_BLOQUEADOS'] });
      const log = await service.emailLog(SUBSCRIBER, ACTOR, {
        canReadReceipts: true,
        readAccess: { canSeeBlocked: true, grantedBy: 'PRIVACY_READ' },
      });
      expect(log.entries[0]?.recipientMasked).toBe('t***@e***.test');
      expect(audit.logWithin).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LIST_ACCESS',
          entityType: 'BillingEmailLog',
          newValue: { grantedBy: 'PRIVACY_READ', count: 1 },
        }),
        expect.anything(),
      );
    });

    it('404 si el suscriptor no existe', async () => {
      titulars.findTitularEmail.mockResolvedValueOnce({
        exists: false,
        anonymized: false,
        partyId: null,
        email: null,
      });
      await expect(
        service.emailLog(SUBSCRIBER, ACTOR, {
          canReadReceipts: true,
          readAccess: { canSeeBlocked: false },
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('tope de envíos por titular y hora (SEC-03, P-01)', () => {
    let recent: number;

    beforeEach(() => {
      recent = 0;
      const base = query.getMockImplementation()!;
      query.mockImplementation(async (sql: string, params: unknown[]) => {
        if (sql.includes('COUNT(*)::int AS total')) return [{ total: String(recent) }];
        return base(sql, params);
      });
    });

    const calls = (fragment: string) =>
      query.mock.calls.filter(([sql]) => String(sql).includes(fragment));

    it('cuenta EN_COLA y ENVIADO del titular en la última hora con el lock del titular', async () => {
      recent = 9;
      await service.requestDocumentEmail(DOCUMENT, ACTOR);
      const [lock] = calls('pg_try_advisory_xact_lock');
      expect(lock?.[1]).toEqual([`billing-email:${TENANT}:${SUBSCRIBER}`]);
      const [count] = calls('COUNT(*)::int AS total');
      expect(String(count?.[0])).toContain("status IN ('EN_COLA', 'ENVIADO', 'ERROR')");
      expect(String(count?.[0])).toContain("interval '1 hour'");
      expect(count?.[1]).toEqual([TENANT, SUBSCRIBER]);
      const order = query.mock.calls.map(([sql]) => String(sql));
      const lockAt = order.findIndex((sql) => sql.includes('pg_try_advisory_xact_lock'));
      const countAt = order.findIndex((sql) => sql.includes('COUNT(*)::int AS total'));
      const insertAt = order.findIndex((sql) => sql.includes('INSERT INTO billing_email_log'));
      expect(lockAt).toBeLessThan(countAt);
      expect(countAt).toBeLessThan(insertAt);
      expect(queue.add).toHaveBeenCalledTimes(1);
    });

    it('al alcanzar el tope responde 429 BILLING_EMAIL_RATE_LIMITED sin crear fila ni encolar', async () => {
      recent = 10;
      await expect(service.requestDocumentEmail(DOCUMENT, ACTOR)).rejects.toMatchObject({
        status: 429,
        response: { code: 'BILLING_EMAIL_RATE_LIMITED' },
      });
      expect(calls('INSERT INTO billing_email_log')).toHaveLength(0);
      expect(queue.add).not.toHaveBeenCalled();
      expect(audit.logWithin).not.toHaveBeenCalled();
    });

    it('una solicitud idempotente (EN_COLA del mismo destino) no consume cupo', async () => {
      recent = 50;
      existing.EN_COLA = logRow();
      const entry = await service.requestDocumentEmail(DOCUMENT, ACTOR);
      expect(entry.id).toBe(LOG);
      expect(calls('COUNT(*)::int AS total')).toHaveLength(0);
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('SEC-EM-01: sin el lock del titular responde 429 sin esperar ni crear fila', async () => {
      lockAcquired = false;
      await expect(service.requestDocumentEmail(DOCUMENT, ACTOR)).rejects.toMatchObject({
        status: 429,
        response: {
          code: 'BILLING_EMAIL_RATE_LIMITED',
          message: 'Hay un envío en curso para este cliente. Intenta en unos segundos.',
        },
      });
      expect(calls('pg_advisory_xact_lock(')).toHaveLength(0);
      expect(calls('INSERT INTO billing_email_log')).toHaveLength(0);
      expect(calls('COUNT(*)::int AS total')).toHaveLength(0);
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('SEC-EM-01: un titular restringido también exige el lock', async () => {
      lockAcquired = false;
      titulars.findTitularEmail.mockResolvedValueOnce({
        exists: true,
        anonymized: true,
        partyId: PARTY,
        email: EMAIL,
      });
      await expect(service.requestDocumentEmail(DOCUMENT, ACTOR)).rejects.toMatchObject({
        status: 429,
      });
      expect(calls('INSERT INTO billing_email_log')).toHaveLength(0);
    });

    it('SEC-EM-02: un RECHAZADO del mismo destino y motivo en la última hora se reutiliza sin auditar', async () => {
      const previous = logRow({
        status: 'RECHAZADO',
        reason_code: 'TITULAR_RESTRINGIDO',
        recipient_masked: null,
      });
      existing.RECHAZADO = previous;
      titulars.findTitularEmail.mockResolvedValueOnce({
        exists: true,
        anonymized: true,
        partyId: PARTY,
        email: EMAIL,
      });
      const entry = await service.requestDocumentEmail(DOCUMENT, ACTOR);
      expect(entry).toMatchObject({
        id: LOG,
        status: 'RECHAZADO',
        reasonCode: 'TITULAR_RESTRINGIDO',
      });
      const [lookup] = calls("interval '1 hour'").filter(([sql]) =>
        String(sql).includes('status = $8'),
      );
      expect(String(lookup?.[0])).toContain('reason_code = $9');
      expect((lookup?.[1] as unknown[]).slice(7)).toEqual(['RECHAZADO', 'TITULAR_RESTRINGIDO']);
      expect(calls('INSERT INTO billing_email_log')).toHaveLength(0);
      expect(audit.logWithin).not.toHaveBeenCalled();
    });

    it('un rechazo por titular restringido no pasa por el tope', async () => {
      recent = 50;
      titulars.findTitularEmail.mockResolvedValueOnce({
        exists: true,
        anonymized: true,
        partyId: PARTY,
        email: EMAIL,
      });
      const entry = await service.requestDocumentEmail(DOCUMENT, ACTOR);
      expect(entry.status).toBe('RECHAZADO');
      expect(calls('COUNT(*)::int AS total')).toHaveLength(0);
    });

    it('el tope sale de BILLING_EMAIL_MAX_PER_SUBSCRIBER_HOUR; un valor inválido cae al defecto', () => {
      const withConfig = (value: unknown) =>
        new BillingEmailsService(
          {} as DataSource,
          queue as unknown as Queue,
          titulars as unknown as BillingTitularContactReadPort,
          marks as unknown as IPrivacyMarksReadPort,
          documents as unknown as BillingDocumentsService,
          payments as unknown as BillingPaymentsService,
          {} as BillingIssuerReadPort,
          audit as unknown as AuditService,
          new ConfigService({ BILLING_EMAIL_MAX_PER_SUBSCRIBER_HOUR: value }),
        ).hourlyLimit();
      expect(service.hourlyLimit()).toBe(BILLING_EMAIL_MAX_PER_SUBSCRIBER_HOUR_DEFAULT);
      expect(BILLING_EMAIL_MAX_PER_SUBSCRIBER_HOUR_DEFAULT).toBe(10);
      expect(withConfig('3')).toBe(3);
      expect(withConfig(25)).toBe(25);
      expect(withConfig(100)).toBe(100);
      for (const invalid of ['0', '-2', '2.5', 'diez', '', null, undefined, 101, '500']) {
        expect(withConfig(invalid)).toBe(10);
      }
      expect(resolveBillingEmailHourlyLimit(7)).toBe(7);
    });

    it('con tope configurado en 2, el tercer envío de la hora responde 429', async () => {
      const limited = new BillingEmailsService(
        {} as DataSource,
        queue as unknown as Queue,
        titulars as unknown as BillingTitularContactReadPort,
        marks as unknown as IPrivacyMarksReadPort,
        documents as unknown as BillingDocumentsService,
        payments as unknown as BillingPaymentsService,
        {
          getIssuerIdentity: jest
            .fn()
            .mockResolvedValue({ legalName: 'ISP', nit: null, verificationDigit: null }),
        } as unknown as BillingIssuerReadPort,
        audit as unknown as AuditService,
        new ConfigService({ BILLING_EMAIL_MAX_PER_SUBSCRIBER_HOUR: 2 }),
      );
      recent = 1;
      await expect(limited.requestStatementEmail(SUBSCRIBER, {}, ACTOR)).resolves.toMatchObject({
        status: 'EN_COLA',
      });
      recent = 2;
      await expect(limited.requestStatementEmail(SUBSCRIBER, {}, ACTOR)).rejects.toMatchObject({
        status: 429,
      });
    });
  });
});
