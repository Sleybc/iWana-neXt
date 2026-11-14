import { ConflictException } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';
import type { DataSource } from 'typeorm';
import { TenantStatus } from '@iwana/shared';
import { AuditService } from '../../audit/audit.service';
import { MailerService } from '../../mailer/mailer.service';
import { IPrivacyMarksReadPort } from '../../privacy/ports/privacy-marks-read.port';
import type { TenantLifecycleReadPort } from '../../tenant/ports/tenant-lifecycle-read.port';
import { BillingDocumentsService } from '../documents/billing-documents.service';
import { BillingPaymentsService } from '../payments/billing-payments.service';
import { BillingIssuerReadPort } from '../ports/billing-issuer-read.port';
import { BillingTitularContactReadPort } from '../ports/billing-titular-contact-read.port';
import { BillingStatementLedgerService } from '../statement/billing-statement-ledger.service';
import { BillingEmailProcessor, parseBillingEmailPayload } from './billing-email.processor';
import { BillingReceiptPdfSource } from './billing-receipt-pdf.source';
import type { BillingEmailLogRow } from './billing-emails.service';

const TENANT = '00000000-0000-4000-8000-000000000001';
const SUBSCRIBER = '00000000-0000-4000-8000-000000000010';
const DOCUMENT = '00000000-0000-4000-8000-000000000020';
const PAYMENT = '00000000-0000-4000-8000-000000000030';
const PARTY = '00000000-0000-4000-8000-000000000040';
const ACTOR = '00000000-0000-4000-8000-000000000050';
const LOG = '00000000-0000-4000-8000-000000000060';
const EMAIL = 'titular@ejemplo.test';
const PAYLOAD = { tenantId: TENANT, tenantSlug: 'acme', schemaName: 'tenant_acme', logId: LOG };

const mockRun = jest.fn();
jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    TenantContext: { run: (_ctx: unknown, work: () => unknown) => work() },
    runInTenantSchema: (...args: unknown[]) => mockRun(...args),
  };
});
jest.mock('../documents/billing-documents.pdf', () => ({
  renderBillingDocumentPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-documento')),
}));

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
    subject: 'Documento de cobro DC-1 · ISP',
    status: 'EN_COLA',
    reason_code: null,
    resend: false,
    requested_by: ACTOR,
    created_at: '2026-11-13T15:00:00.000Z',
    processed_at: null,
    ...overrides,
  };
}

describe('parseBillingEmailPayload', () => {
  it('acepta solo ids y contexto tenant válidos', () => {
    expect(parseBillingEmailPayload({ ...PAYLOAD, extra: 'x' })).toEqual(PAYLOAD);
    for (const bad of [
      null,
      'x',
      { ...PAYLOAD, logId: 'no-uuid' },
      { ...PAYLOAD, tenantSlug: 'A B' },
    ])
      expect(() => parseBillingEmailPayload(bad)).toThrow(UnrecoverableError);
  });
});

describe('BillingEmailProcessor', () => {
  let row: BillingEmailLogRow | undefined;
  let lockedStatus: string | undefined;
  let lockedRecipient: string | null | undefined;
  let payments: { getPayment: jest.Mock };
  let query: jest.Mock;
  let titulars: { findTitularEmail: jest.Mock };
  let marks: { activeMarks: jest.Mock };
  let documents: { pdfDocument: jest.Mock };
  let receipts: { receiptPdf: jest.Mock };
  let ledgers: { ledgerPdf: jest.Mock };
  let mailer: { sendMail: jest.Mock };
  let audit: { logWithin: jest.Mock };
  let processor: BillingEmailProcessor;

  beforeEach(() => {
    row = logRow();
    lockedStatus = undefined;
    lockedRecipient = undefined;
    payments = { getPayment: jest.fn().mockResolvedValue({ id: PAYMENT, status: 'REGISTRADO' }) };
    query = jest.fn(async (sql: string) => {
      if (sql.includes('FOR UPDATE'))
        return row
          ? [
              {
                status: lockedStatus ?? row.status,
                kind: row.kind,
                recipient_masked:
                  lockedRecipient === undefined ? row.recipient_masked : lockedRecipient,
              },
            ]
          : [];
      if (sql.includes('FROM billing_email_log')) return row ? [row] : [];
      return [];
    });
    mockRun.mockReset();
    mockRun.mockImplementation((_ds, _schema, work: (qr: unknown) => unknown) =>
      work({ query, manager: { query } }),
    );
    titulars = {
      findTitularEmail: jest
        .fn()
        .mockResolvedValue({ exists: true, anonymized: false, partyId: PARTY, email: EMAIL }),
    };
    marks = { activeMarks: jest.fn().mockResolvedValue({}) };
    documents = {
      pdfDocument: jest.fn().mockResolvedValue({ id: DOCUMENT, status: 'EMITIDO', number: 'DC-1' }),
    };
    receipts = {
      receiptPdf: jest.fn().mockResolvedValue({
        filename: 'recibo-15.pdf',
        content: Buffer.from('%PDF-recibo'),
        receiptNumber: 15,
      }),
    };
    ledgers = {
      ledgerPdf: jest.fn().mockResolvedValue({
        filename: 'estado-de-cuenta-2026-03-31.pdf',
        content: Buffer.from('%PDF-libro'),
      }),
    };
    mailer = { sendMail: jest.fn().mockResolvedValue(undefined) };
    audit = { logWithin: jest.fn().mockResolvedValue(undefined) };
    const tenants = {
      findTenantLifecycleById: jest.fn().mockResolvedValue({
        id: TENANT,
        schemaName: 'tenant_acme',
        slug: 'acme',
        status: TenantStatus.ACTIVE,
        deletedAt: null,
      }),
    };
    processor = new BillingEmailProcessor(
      {} as DataSource,
      titulars as unknown as BillingTitularContactReadPort,
      marks as unknown as IPrivacyMarksReadPort,
      documents as unknown as BillingDocumentsService,
      receipts as unknown as BillingReceiptPdfSource,
      payments as unknown as BillingPaymentsService,
      ledgers as unknown as BillingStatementLedgerService,
      {
        getIssuerIdentity: jest
          .fn()
          .mockResolvedValue({ legalName: 'Redes ISP', nit: null, verificationDigit: null }),
      } as unknown as BillingIssuerReadPort,
      mailer as unknown as MailerService,
      audit as unknown as AuditService,
      tenants as unknown as TenantLifecycleReadPort,
    );
  });

  const updates = () =>
    query.mock.calls.filter(([sql]) => String(sql).includes('UPDATE billing_email_log'));

  it('envía el documento al correo registrado y deja ENVIADO con el destinatario enmascarado', async () => {
    await expect(processor.send(PAYLOAD)).resolves.toBe('ENVIADO');
    expect(documents.pdfDocument).toHaveBeenCalledWith(DOCUMENT, ACTOR);
    expect(mailer.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: EMAIL,
        subject: 'Documento de cobro DC-1 · Redes ISP',
        attachments: [
          expect.objectContaining({
            filename: 'documento-de-cobro-DC-1.pdf',
            contentType: 'application/pdf',
          }),
        ],
      }),
    );
    const [update] = updates();
    expect(update?.[0]).toContain("SET status = 'ENVIADO'");
    expect(update?.[1]).toEqual([
      TENANT,
      LOG,
      't***@e***.test',
      'Documento de cobro DC-1 · Redes ISP',
    ]);
    expect(JSON.stringify(query.mock.calls)).not.toContain(EMAIL);
    expect(JSON.stringify(audit.logWithin.mock.calls)).not.toContain(EMAIL);
  });

  it('no hace nada si la fila ya es terminal o no existe', async () => {
    row = logRow({ status: 'ENVIADO' });
    await expect(processor.send(PAYLOAD)).resolves.toBe('ENVIADO');
    row = undefined;
    await expect(processor.send(PAYLOAD)).resolves.toBeNull();
    expect(mailer.sendMail).not.toHaveBeenCalled();
    expect(updates()).toHaveLength(0);
  });

  it('no envía si otro proceso cerró la fila antes del bloqueo', async () => {
    lockedStatus = 'RECHAZADO';
    await expect(processor.send(PAYLOAD)).resolves.toBe('RECHAZADO');
    expect(mailer.sendMail).not.toHaveBeenCalled();
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
      { exists: true, anonymized: false, partyId: null, email: null },
      {},
      'SIN_CORREO',
    ],
  ])(
    'titular %s al momento del envío: RECHAZADO sin destinatario',
    async (_label, titular, activeMarks, reason) => {
      titulars.findTitularEmail.mockResolvedValue(titular);
      marks.activeMarks.mockResolvedValue(activeMarks);
      await expect(processor.send(PAYLOAD)).resolves.toBe('RECHAZADO');
      expect(mailer.sendMail).not.toHaveBeenCalled();
      expect(documents.pdfDocument).not.toHaveBeenCalled();
      expect(updates()[0]?.[1]).toEqual([TENANT, LOG, 'RECHAZADO', reason, true]);
    },
  );

  it('documento anulado o inexistente entre la solicitud y el envío: ERROR sin reintento', async () => {
    documents.pdfDocument.mockResolvedValueOnce({
      id: DOCUMENT,
      status: 'ANULADO',
      number: 'DC-1',
    });
    await expect(processor.send(PAYLOAD)).resolves.toBe('ERROR');
    expect(updates()[0]?.[1]).toEqual([TENANT, LOG, 'ERROR', 'FALLO_DE_ENVIO', false]);
    documents.pdfDocument.mockRejectedValueOnce(new ConflictException());
    query.mockClear();
    await expect(processor.send(PAYLOAD)).resolves.toBe('ERROR');
    expect(mailer.sendMail).not.toHaveBeenCalled();
  });

  it('un fallo del servidor de correo se propaga para reintentar y no toca la fila', async () => {
    mailer.sendMail.mockRejectedValueOnce(new Error('SMTP 550 buzón inexistente'));
    await expect(processor.send(PAYLOAD)).rejects.toThrow('SMTP');
    expect(updates()).toHaveLength(0);
  });

  it('recibo: pide el PDF a la fuente de recibos sin acceso a datos bloqueados', async () => {
    row = logRow({ kind: 'RECIBO', document_id: null, payment_id: PAYMENT });
    await expect(processor.send(PAYLOAD)).resolves.toBe('ENVIADO');
    expect(receipts.receiptPdf).toHaveBeenCalledWith(PAYMENT, {
      canSeeBlocked: false,
      actorId: ACTOR,
    });
    expect(mailer.sendMail.mock.calls[0]?.[0].subject).toBe('Recibo de pago N.º 15 · Redes ISP');
  });

  it('estado de cuenta: arma el libro del periodo pedido', async () => {
    row = logRow({
      kind: 'ESTADO_CUENTA',
      document_id: null,
      period_from: '2026-01-01',
      period_to: '2026-03-31',
    });
    await expect(processor.send(PAYLOAD)).resolves.toBe('ENVIADO');
    expect(ledgers.ledgerPdf).toHaveBeenCalledWith(
      SUBSCRIBER,
      { from: '2026-01-01', to: '2026-03-31' },
      ACTOR,
      { canSeeBlocked: false },
    );
    expect(mailer.sendMail.mock.calls[0]?.[0].attachments[0].filename).toBe(
      'estado-de-cuenta-2026-03-31.pdf',
    );
  });

  it('SEC-01 (a): si la supresión vació el destinatario bajo el bloqueo, cierra sin enviar', async () => {
    lockedRecipient = null;
    await expect(processor.send(PAYLOAD)).resolves.toBe('RECHAZADO');
    expect(mailer.sendMail).not.toHaveBeenCalled();
    const [update] = updates();
    expect(update?.[1]).toEqual([TENANT, LOG, 'RECHAZADO', 'TITULAR_RESTRINGIDO', true]);
    // Mismo qr de la transacción bloqueada: una sola apertura de runInTenantSchema para el cierre.
    expect(audit.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({ newValue: expect.objectContaining({ status: 'RECHAZADO' }) }),
      expect.anything(),
    );
  });

  it('SEC-01 (b): relee titular y marcas con la fila bloqueada', async () => {
    marks.activeMarks
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ [PARTY]: ['DATOS_BLOQUEADOS'] });
    await expect(processor.send(PAYLOAD)).resolves.toBe('RECHAZADO');
    expect(titulars.findTitularEmail).toHaveBeenCalledTimes(2);
    expect(mailer.sendMail).not.toHaveBeenCalled();
    expect(updates()[0]?.[1]).toEqual([TENANT, LOG, 'RECHAZADO', 'TITULAR_RESTRINGIDO', true]);
  });

  it('SEC-01 (b): usa el correo releído y falla cerrado si el puerto de privacidad no responde', async () => {
    titulars.findTitularEmail
      .mockResolvedValueOnce({ exists: true, anonymized: false, partyId: PARTY, email: EMAIL })
      .mockResolvedValueOnce({
        exists: true,
        anonymized: false,
        partyId: PARTY,
        email: 'nuevo@ejemplo.test',
      });
    await expect(processor.send(PAYLOAD)).resolves.toBe('ENVIADO');
    expect(mailer.sendMail.mock.calls[0]?.[0].to).toBe('nuevo@ejemplo.test');

    mailer.sendMail.mockClear();
    query.mockClear();
    marks.activeMarks.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('privacy down'));
    await expect(processor.send(PAYLOAD)).rejects.toThrow('privacy down');
    expect(mailer.sendMail).not.toHaveBeenCalled();
    expect(updates()).toHaveLength(0);
  });

  it('SEC-01 (c): el UPDATE a ENVIADO no reescribe un destinatario vaciado', async () => {
    await processor.send(PAYLOAD);
    expect(String(updates()[0]?.[0])).toContain(
      'recipient_masked = CASE WHEN recipient_masked IS NULL THEN NULL ELSE $3 END',
    );
  });

  it('SEC-04: un pago anulado tras encolar no envía el recibo', async () => {
    row = logRow({ kind: 'RECIBO', document_id: null, payment_id: PAYMENT });
    payments.getPayment.mockResolvedValueOnce({ id: PAYMENT, status: 'ANULADO' });
    await expect(processor.send(PAYLOAD)).resolves.toBe('ERROR');
    expect(receipts.receiptPdf).not.toHaveBeenCalled();
    expect(mailer.sendMail).not.toHaveBeenCalled();
    expect(updates()[0]?.[1]).toEqual([TENANT, LOG, 'ERROR', 'FALLO_DE_ENVIO', false]);
  });

  describe('onFailed', () => {
    const job = (attemptsMade: number, data: unknown = PAYLOAD) =>
      ({ attemptsMade, opts: { attempts: 5 }, data }) as unknown as Job<unknown>;

    it('no marca nada mientras queden reintentos', async () => {
      await processor.onFailed(job(2), new Error('x'));
      expect(updates()).toHaveLength(0);
    });

    it('al agotar los reintentos deja ERROR / FALLO_DE_ENVIO sin el mensaje del error', async () => {
      await processor.onFailed(job(5), new Error('SMTP 550 detalle sensible'));
      expect(updates()[0]?.[1]).toEqual([TENANT, LOG, 'ERROR', 'FALLO_DE_ENVIO', false]);
      expect(JSON.stringify(query.mock.calls)).not.toContain('SMTP');
    });

    it('un error definitivo cierra la fila aunque queden intentos; un payload inválido se ignora', async () => {
      await processor.onFailed(job(1), new UnrecoverableError('x'));
      expect(updates()).toHaveLength(1);
      await processor.onFailed(job(5, { logId: 'x' }), new Error('x'));
      await processor.onFailed(undefined, new Error('x'));
      expect(updates()).toHaveLength(1);
    });
  });

  it('omite trabajos con otro nombre', async () => {
    await processor.process({ name: 'otro', data: PAYLOAD } as unknown as Job<unknown>);
    expect(query).not.toHaveBeenCalled();
  });

  it('procesa el trabajo de la cola', async () => {
    await processor.process({
      name: 'billing-email-send',
      data: PAYLOAD,
    } as unknown as Job<unknown>);
    expect(mailer.sendMail).toHaveBeenCalledTimes(1);
  });
});
