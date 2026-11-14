import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Job, Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { dataSourceOptions, runInTenantSchema, TenantContext } from '@iwana/db';
import { TenantStatus } from '@iwana/shared';
import {
  billingPostgresIntegrationEnabled,
  dropBillingTenantFixture,
} from '../../../../../packages/database/src/migrations/tenant/billing-migration.integration-helpers';
import { encryptAes256Gcm } from '../../common/crypto/aes-gcm.util';
import { BillingContractReadAdapter } from '../crm/contracts/billing-contract-read.adapter';
import { BillingTitularContactReadAdapter } from '../crm/contracts/billing-titular-contact-read.adapter';
import type { MailerService } from '../mailer/mailer.service';
import type { TenantLifecycleReadPort } from '../tenant/ports/tenant-lifecycle-read.port';
import { createBillingSchema } from './billing-postgres.fixture';
import { BillingDocumentsService } from './documents/billing-documents.service';
import { BillingEmailProcessor } from './emails/billing-email.processor';
import type { BillingEmailJobPayload } from './emails/billing-email.constants';
import { BillingEmailsService } from './emails/billing-emails.service';
import { BillingPaymentsService } from './payments/billing-payments.service';
import { BillingReceiptsService } from './payments/billing-receipts.service';
import { moneyToCents } from './statement/billing-statement-ledger';
import { BillingStatementLedgerService } from './statement/billing-statement-ledger.service';

/**
 * Bloque B de la spec MOD05↔MOD14 2026-11-13 contra PostgreSQL real (173…208 del fixture):
 * identidad R2 del libro con `statementForSubscriber`, idempotencia del envío por el índice único
 * de la 208, procesador con FOR UPDATE, CA-4, CA-6 y el recibo numerado del bloque A adjunto.
 * Solo se simulan la cola (sin Redis), el servidor de correo y las marcas de privacidad.
 */
const describeDb = billingPostgresIntegrationEnabled ? describe : describe.skip;

type Fixture = Awaited<ReturnType<typeof createBillingSchema>>;

const KEY_HEX = '12'.repeat(32);

describeDb(
  'Libro del estado de cuenta y correos de Facturación (spec 2026-11-13, bloque B)',
  () => {
    let ds: DataSource;
    let fixture: Fixture | undefined;
    let schemaName: string;
    let tenantId: string;
    let payments: BillingPaymentsService;
    let documents: BillingDocumentsService;
    let ledgers: BillingStatementLedgerService;
    let emails: BillingEmailsService;
    let processor: BillingEmailProcessor;
    const actorId = randomUUID();
    const tenantSlug = 'emails-fixture';
    let marks: Record<string, string[]> = {};
    const queued: Array<{ data: BillingEmailJobPayload; jobId: string }> = [];
    const queue = {
      add: jest.fn(async (_name: string, data: BillingEmailJobPayload, opts: { jobId: string }) => {
        queued.push({ data, jobId: opts.jobId });
      }),
    };
    const mailer = { sendMail: jest.fn().mockResolvedValue(undefined) };
    const config = new ConfigService({
      PII_ENCRYPTION_KEY: KEY_HEX,
      MFA_ENCRYPTION_KEY: KEY_HEX,
      PII_HASH_KEY: '34'.repeat(32),
      NODE_ENV: 'test',
    });
    const settings = { getSnapshot: jest.fn().mockResolvedValue({ timezone: 'America/Bogota' }) };
    const issuer = {
      getIssuerIdentity: jest.fn().mockResolvedValue({
        legalName: 'Operador sintético',
        nit: '900000000',
        verificationDigit: '1',
      }),
    };
    const privacy = {
      activeMarks: jest.fn(async (ids: string[]) =>
        Object.fromEntries(ids.map((id) => [id, marks[id] ?? []])),
      ),
    };
    const audit = {
      logWithin: jest.fn(
        async (
          entry: { action: string; entityType: string; entityId: string; newValue?: unknown },
          manager: { query: (sql: string, args: unknown[]) => Promise<unknown> },
        ) => {
          await manager.query(
            `INSERT INTO test_emails_audit (action, entity_type, entity_id, new_value)
           VALUES ($1, $2, $3, $4::jsonb)`,
            [
              entry.action,
              entry.entityType,
              entry.entityId,
              JSON.stringify(entry.newValue ?? null),
            ],
          );
        },
      ),
    };

    const context = () => ({ tenantId, schemaName, tenantSlug });
    const run = <T>(fn: () => Promise<T>) => TenantContext.run(context(), fn);
    const sql = <T = Record<string, unknown>>(query: string, args: unknown[] = []) =>
      runInTenantSchema(ds, schemaName, (qr) => qr.query(query, args) as Promise<T[]>);

    async function seedTitular(email: string | null = 'titular.sintetico@ejemplo.test'): Promise<{
      subscriber: string;
      contract: string;
      partyId: string;
    }> {
      const subscriber = randomUUID();
      const contract = randomUUID();
      const partyId = randomUUID();
      await sql(
        `INSERT INTO subscribers (id, tenant_id, party_id, person_type, first_name, last_name,
         email_encrypted)
       VALUES ($1, $2, $3, 'NATURAL', 'Titular', 'Sintético', $4)`,
        [
          subscriber,
          tenantId,
          partyId,
          email ? encryptAes256Gcm(email, Buffer.from(KEY_HEX, 'hex')) : null,
        ],
      );
      await sql(
        `INSERT INTO contracts (id, tenant_id, subscriber_id, status, plan_snapshot_json)
       VALUES ($1, $2, $3, 'ACTIVE', '{}'::jsonb)`,
        [contract, tenantId, subscriber],
      );
      return { subscriber, contract, partyId };
    }

    async function seedDocument(
      titular: { subscriber: string; contract: string },
      input: { total: string; issueDate: string; dueDate: string },
    ): Promise<string> {
      const period = randomUUID();
      const document = randomUUID();
      await sql(
        `INSERT INTO billing_periods (id, tenant_id, contract_id, subscriber_id, period_start,
         period_end, covered_start, generation_date, due_date, effective_policy)
       VALUES ($1, $2, $3, $4, $5::date, $5::date, $5::date, $5::date, $6::date, '{}'::jsonb)`,
        [period, tenantId, titular.contract, titular.subscriber, input.issueDate, input.dueDate],
      );
      await sql(
        `INSERT INTO billing_documents (id, tenant_id, period_id, contract_id, subscriber_id, status,
         number, issue_date, due_date, subtotal, tax_total, total, buyer_snapshot)
       VALUES ($1, $2, $3, $4, $5, 'EMITIDO', $6, $7::date, $8::date, $9, 0, $9,
               '{"displayName":"Titular Sintético"}'::jsonb)`,
        [
          document,
          tenantId,
          period,
          titular.contract,
          titular.subscriber,
          `DC-${document.slice(0, 8)}`,
          input.issueDate,
          input.dueDate,
          input.total,
        ],
      );
      return document;
    }

    async function register(
      subscriber: string,
      amount: string,
      paidAt: string,
      allocations?: Array<{ documentId: string; amount: string }>,
    ) {
      return run(() =>
        payments.registerPayment(
          {
            subscriberId: subscriber,
            method: 'EFECTIVO',
            amount,
            paidAt,
            ...(allocations ? { allocations } : {}),
          },
          `emails-${randomUUID()}`,
          actorId,
        ),
      );
    }

    async function logRows(subscriber: string) {
      return sql<{
        id: string;
        kind: string;
        status: string;
        reason_code: string | null;
        recipient_masked: string | null;
        subject: string;
        resend: boolean;
      }>(
        `SELECT id::text, kind, status, reason_code, recipient_masked, subject, resend
         FROM billing_email_log WHERE subscriber_id = $1 ORDER BY created_at, id`,
        [subscriber],
      );
    }

    /** Procesa el último trabajo encolado como lo haría el worker. */
    const processLast = () => processor.send(queued[queued.length - 1]!.data);

    beforeAll(async () => {
      ds = new DataSource({
        ...dataSourceOptions,
        entities: [],
        migrations: [],
        logging: false,
        extra: { max: 10, connectionTimeoutMillis: 5000 },
      });
      await ds.initialize();
      fixture = await createBillingSchema(ds);
      schemaName = fixture.schemaName;
      tenantId = fixture.tenantId;
      await sql(`CREATE TABLE test_emails_audit (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), action text NOT NULL,
      entity_type text NOT NULL, entity_id text NOT NULL, new_value jsonb NULL)`);
      const adapter = new BillingContractReadAdapter(ds, config, settings as never);
      payments = new BillingPaymentsService(
        ds,
        adapter,
        audit as never,
        new EventEmitter2(),
        privacy as never,
        settings as never,
      );
      documents = new BillingDocumentsService(
        ds,
        audit as never,
        adapter,
        issuer as never,
        config,
        { getEffectivePermissionsForUser: jest.fn().mockResolvedValue([]) } as never,
        settings as never,
        privacy as never,
        payments,
      );
      const receipts = new BillingReceiptsService(ds, payments, adapter, issuer as never);
      ledgers = new BillingStatementLedgerService(payments, settings as never, issuer as never);
      const titulars = new BillingTitularContactReadAdapter(ds, config);
      emails = new BillingEmailsService(
        ds,
        queue as unknown as Queue,
        titulars,
        privacy as never,
        documents,
        payments,
        issuer as never,
        audit as never,
      );
      const tenants = {
        findTenantLifecycleById: jest.fn(async () => ({
          id: tenantId,
          schemaName,
          slug: tenantSlug,
          status: TenantStatus.ACTIVE,
          deletedAt: null,
        })),
      };
      processor = new BillingEmailProcessor(
        ds,
        titulars,
        privacy as never,
        documents,
        receipts,
        payments,
        ledgers,
        issuer as never,
        mailer as unknown as MailerService,
        audit as never,
        tenants as unknown as TenantLifecycleReadPort,
      );
    }, 120_000);

    afterAll(async () => {
      await dropBillingTenantFixture(ds, fixture);
      if (ds?.isInitialized) await ds.destroy();
    });

    beforeEach(() => {
      marks = {};
      queued.length = 0;
      queue.add.mockClear();
      mailer.sendMail.mockReset();
      mailer.sendMail.mockResolvedValue(undefined);
    });

    describe('R2 identidad del libro (CA-2)', () => {
      it('cuadra con el estado de cuenta real: retención, cortesía topada, anulado con pagos, saldo a favor e importado', async () => {
        const titular = await seedTitular();
        // D1: pago con retención (valor recibido 96 + retención 4 saldan 100).
        const d1 = await seedDocument(titular, {
          total: '100.00',
          issueDate: '2026-09-01',
          dueDate: '2026-09-15',
        });
        const p1 = randomUUID();
        await sql(
          `INSERT INTO billing_payments (id, tenant_id, subscriber_id, method, amount, paid_at,
           idempotency_key, created_by)
         VALUES ($1, $2, $3, 'TRANSFERENCIA', 96, '2026-09-10', $4, $5)`,
          [p1, tenantId, titular.subscriber, `p1-${p1}`, actorId],
        );
        await sql(
          `INSERT INTO billing_payment_allocations (tenant_id, payment_id, document_id, amount, created_by)
         VALUES ($1, $2, $3, 100, $4)`,
          [tenantId, p1, d1, actorId],
        );
        await sql(
          `INSERT INTO billing_payment_withholdings (tenant_id, payment_id, document_id, subscriber_id,
           tax_code, base, rate, amount, certificate_number, created_by)
         VALUES ($1, $2, $3, $4, 'RETE_FUENTE_SERVICIOS', 100, 4, 4, 'CERT-1', $5)`,
          [tenantId, p1, d1, titular.subscriber, actorId],
        );
        // D2: pago parcial de 60 y ajuste de cortesía de 80, topado a 40.
        const d2 = await seedDocument(titular, {
          total: '100.00',
          issueDate: '2026-10-01',
          dueDate: '2026-10-15',
        });
        await register(titular.subscriber, '60.00', '2026-10-05', [
          { documentId: d2, amount: '60.00' },
        ]);
        await sql(
          `INSERT INTO billing_courtesies (tenant_id, document_id, subscriber_id, application, target,
           amount, reason_code, idempotency_key, created_by)
         VALUES ($1, $2, $3, 'AJUSTE_SOBRE_EMITIDO', 'VALOR', 80, 'PROMOCION_COMERCIAL', $4, $5)`,
          [tenantId, d2, titular.subscriber, `c-${d2}`, actorId],
        );
        // D3: pagado y luego anulado; el pago queda como saldo a favor.
        const d3 = await seedDocument(titular, {
          total: '50.00',
          issueDate: '2026-10-20',
          dueDate: '2026-11-05',
        });
        await register(titular.subscriber, '50.00', '2026-10-21', [
          { documentId: d3, amount: '50.00' },
        ]);
        await run(() => documents.void(d3, 'DUPLICADO', undefined, actorId));
        // Pago sin aplicar: saldo a favor.
        await register(titular.subscriber, '30.00', '2026-11-01', []);
        // Histórico importado de 70 con un pago importado de 20.
        const d4 = randomUUID();
        await sql(
          `INSERT INTO billing_documents (id, tenant_id, contract_id, subscriber_id, status,
           external_number, issue_date, due_date, subtotal, tax_total, total, external_id,
           import_batch_id)
         VALUES ($1, $2, $3, $4, 'IMPORTADO', 'UISP-9', '2025-12-01', '2025-12-15', 70, 0, 70,
                 $5, $6)`,
          [d4, tenantId, titular.contract, titular.subscriber, `uisp:invoice:${d4}`, randomUUID()],
        );
        const p5 = randomUUID();
        await sql(
          `INSERT INTO billing_payments (id, tenant_id, subscriber_id, method, amount, paid_at,
           idempotency_key, created_by, external_id, import_batch_id)
         VALUES ($1, $2, $3, 'EFECTIVO', 20, '2025-12-10', $4, $5, $6, $7)`,
          [
            p5,
            tenantId,
            titular.subscriber,
            `p5-${p5}`,
            actorId,
            `uisp:payment:${p5}`,
            randomUUID(),
          ],
        );
        await sql(
          `INSERT INTO billing_payment_allocations (tenant_id, payment_id, document_id, amount, created_by)
         VALUES ($1, $2, $3, 20, $4)`,
          [tenantId, p5, d4, actorId],
        );

        const statement = await run(() =>
          payments.statementForSubscriber(titular.subscriber, actorId, { canSeeBlocked: false }),
        );
        const ledger = await run(() =>
          ledgers.ledger(titular.subscriber, {}, actorId, { canSeeBlocked: false }),
        );
        expect(statement.totalPending).toBe('50.00');
        expect(statement.creditBalance).toBe('80.00');
        expect(moneyToCents(ledger.closingBalance)).toBe(
          moneyToCents(statement.totalPending) - moneyToCents(statement.creditBalance),
        );
        expect(ledger.closingBalance).toBe('-30.00');
        expect(ledger.rows[ledger.rows.length - 1]?.balance).toBe('-30.00');
        expect(ledger.rows.find((row) => row.kind === 'CORTESIA')?.credit).toBe('40.00');
        expect(ledger.rows.find((row) => row.kind === 'RETENCION')?.credit).toBe('4.00');
        expect(ledger.rows.find((row) => row.documentId === d3)?.kind).toBe('DOCUMENTO_ANULADO');
        expect(ledger.rows[0]).toMatchObject({ kind: 'DOCUMENTO', reference: 'UISP-9' });
        const receipts = ledger.rows.filter((row) => row.kind === 'PAGO' && row.receiptNumber);
        expect(receipts.length).toBeGreaterThanOrEqual(3);

        const filtered = await run(() =>
          ledgers.ledger(titular.subscriber, { from: '2026-10-01' }, actorId, {
            canSeeBlocked: false,
          }),
        );
        expect(filtered.rows[0]).toMatchObject({ kind: 'SALDO_ANTERIOR', balance: '50.00' });
        expect(filtered.closingBalance).toBe('-30.00');

        const pdf = await run(() =>
          ledgers.ledgerPdf(titular.subscriber, {}, actorId, { canSeeBlocked: false }),
        );
        expect(pdf.content.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      });
    });

    describe('CA-4 envío de la factura con registro', () => {
      it('encola, envía una sola vez aunque el trabajo corra dos veces y deja ENVIADO auditado', async () => {
        const titular = await seedTitular();
        const document = await seedDocument(titular, {
          total: '119.00',
          issueDate: '2026-11-01',
          dueDate: '2026-11-15',
        });
        const [first, second] = await Promise.all([
          run(() => emails.requestDocumentEmail(document, actorId)),
          run(() => emails.requestDocumentEmail(document, actorId)),
        ]);
        expect(first.id).toBe(second.id);
        expect(first).toMatchObject({ status: 'EN_COLA', recipientMasked: 't***@e***.test' });
        expect(queue.add).toHaveBeenCalledTimes(1);
        expect(queued[0]).toEqual({
          data: { tenantId, tenantSlug, schemaName, logId: first.id },
          jobId: `billing-email-${first.id}`,
        });

        const results = await Promise.all([processLast(), processLast()]);
        expect(results.sort()).toEqual(['ENVIADO', 'ENVIADO']);
        expect(mailer.sendMail).toHaveBeenCalledTimes(1);
        const mail = mailer.sendMail.mock.calls[0]![0] as {
          to: string;
          subject: string;
          attachments: Array<{ filename: string; content: Buffer }>;
        };
        expect(mail.to).toBe('titular.sintetico@ejemplo.test');
        expect(mail.subject).toBe(
          `Documento de cobro DC-${document.slice(0, 8)} · Operador sintético`,
        );
        expect(mail.attachments[0]!.content.subarray(0, 5).toString('latin1')).toBe('%PDF-');

        const log = await run(() =>
          emails.emailLog(titular.subscriber, actorId, {
            canReadReceipts: true,
            readAccess: { canSeeBlocked: false },
          }),
        );
        expect(log.entries).toEqual([
          expect.objectContaining({ id: first.id, status: 'ENVIADO', reasonCode: null }),
        ]);
        const audited = await sql<{ action: string; new_value: unknown }>(
          `SELECT action, new_value FROM test_emails_audit WHERE entity_id = $1 ORDER BY action`,
          [first.id],
        );
        expect(audited.map((row) => row.action)).toEqual(['CREATE', 'UPDATE']);
        expect(JSON.stringify(audited)).not.toContain('ejemplo.test');

        // Reenviar: fila nueva marcada como reenvío.
        const again = await run(() => emails.requestDocumentEmail(document, actorId));
        expect(again).toMatchObject({ status: 'EN_COLA', resend: true });
        expect(again.id).not.toBe(first.id);
      });

      it('un fallo de envío agotado queda visible como ERROR / FALLO_DE_ENVIO', async () => {
        const titular = await seedTitular();
        const document = await seedDocument(titular, {
          total: '50.00',
          issueDate: '2026-11-02',
          dueDate: '2026-11-16',
        });
        const entry = await run(() => emails.requestDocumentEmail(document, actorId));
        mailer.sendMail.mockRejectedValue(new Error('SMTP 550 buzón inexistente'));
        await expect(processLast()).rejects.toThrow('SMTP');
        expect((await logRows(titular.subscriber))[0]?.status).toBe('EN_COLA');
        await processor.onFailed(
          {
            attemptsMade: 5,
            opts: { attempts: 5 },
            data: queued[0]!.data,
          } as unknown as Job<unknown>,
          new Error('SMTP 550 buzón inexistente'),
        );
        const log = await run(() =>
          emails.emailLog(titular.subscriber, actorId, {
            canReadReceipts: true,
            readAccess: { canSeeBlocked: false },
          }),
        );
        expect(log.entries[0]).toMatchObject({
          id: entry.id,
          status: 'ERROR',
          reasonCode: 'FALLO_DE_ENVIO',
          processedAt: expect.any(String),
        });
        expect(JSON.stringify(await logRows(titular.subscriber))).not.toContain('SMTP');
      });
    });

    describe('recibo y estado de cuenta', () => {
      it('adjunta el recibo con el número real del bloque A', async () => {
        const titular = await seedTitular();
        const document = await seedDocument(titular, {
          total: '80.00',
          issueDate: '2026-11-01',
          dueDate: '2026-11-15',
        });
        const payment = await register(titular.subscriber, '80.00', '2026-11-03', [
          { documentId: document, amount: '80.00' },
        ]);
        expect(payment.receiptNumber).toEqual(expect.any(Number));
        await run(() =>
          emails.requestReceiptEmail(payment.id, actorId, { canSeeBlocked: false, actorId }),
        );
        await expect(processLast()).resolves.toBe('ENVIADO');
        const mail = mailer.sendMail.mock.calls[0]![0] as {
          subject: string;
          attachments: Array<{ filename: string; content: Buffer }>;
        };
        expect(mail.subject).toBe(
          `Recibo de pago N.º ${payment.receiptNumber} · Operador sintético`,
        );
        expect(mail.attachments[0]!.filename).toBe(`recibo-${payment.receiptNumber}.pdf`);
        expect(mail.attachments[0]!.content.toString('latin1')).toContain(
          `Recibo de pago ${payment.receiptNumber}`,
        );
      });

      it('envía el libro del periodo pedido', async () => {
        const titular = await seedTitular();
        await seedDocument(titular, {
          total: '40.00',
          issueDate: '2026-10-01',
          dueDate: '2026-10-15',
        });
        const entry = await run(() =>
          emails.requestStatementEmail(
            titular.subscriber,
            { from: '2026-09-01', to: '2026-10-31' },
            actorId,
          ),
        );
        expect(entry).toMatchObject({ periodFrom: '2026-09-01', periodTo: '2026-10-31' });
        await expect(processLast()).resolves.toBe('ENVIADO');
        const mail = mailer.sendMail.mock.calls[0]![0] as {
          text: string;
          attachments: Array<{ filename: string }>;
        };
        expect(mail.attachments[0]!.filename).toBe('estado-de-cuenta-2026-10-31.pdf');
        expect(mail.text).toContain('del 01/09/2026 al 31/10/2026');
      });
    });

    describe('CA-6 titular restringido', () => {
      it('DATOS_BLOQUEADOS o anonimizado: RECHAZADO / TITULAR_RESTRINGIDO sin destinatario', async () => {
        const blocked = await seedTitular();
        marks = { [blocked.partyId]: ['DATOS_BLOQUEADOS'] };
        const rejected = await run(() =>
          emails.requestStatementEmail(blocked.subscriber, {}, actorId),
        );
        expect(rejected).toMatchObject({
          status: 'RECHAZADO',
          reasonCode: 'TITULAR_RESTRINGIDO',
          recipientMasked: null,
        });

        const anonymized = await seedTitular();
        await sql(`UPDATE subscribers SET anonymized_at = now() WHERE id = $1`, [
          anonymized.subscriber,
        ]);
        const rejectedAnon = await run(() =>
          emails.requestStatementEmail(anonymized.subscriber, {}, actorId),
        );
        expect(rejectedAnon).toMatchObject({
          status: 'RECHAZADO',
          reasonCode: 'TITULAR_RESTRINGIDO',
        });

        const withoutEmail = await seedTitular(null);
        const noEmail = await run(() =>
          emails.requestStatementEmail(withoutEmail.subscriber, {}, actorId),
        );
        expect(noEmail).toMatchObject({ status: 'RECHAZADO', reasonCode: 'SIN_CORREO' });
        expect(queue.add).not.toHaveBeenCalled();
        expect(mailer.sendMail).not.toHaveBeenCalled();
      });

      it('bloqueado después de encolar: el procesador lo rechaza y borra el destinatario', async () => {
        const titular = await seedTitular();
        const entry = await run(() =>
          emails.requestStatementEmail(titular.subscriber, {}, actorId),
        );
        expect(entry.recipientMasked).toBe('t***@e***.test');
        marks = { [titular.partyId]: ['DATOS_BLOQUEADOS'] };
        await expect(processLast()).resolves.toBe('RECHAZADO');
        expect(mailer.sendMail).not.toHaveBeenCalled();
        expect((await logRows(titular.subscriber))[0]).toMatchObject({
          status: 'RECHAZADO',
          reason_code: 'TITULAR_RESTRINGIDO',
          recipient_masked: null,
        });
        // El lector sin permiso tampoco ve destinatarios anteriores del titular bloqueado.
        const log = await run(() =>
          emails.emailLog(titular.subscriber, actorId, {
            canReadReceipts: false,
            readAccess: { canSeeBlocked: false },
          }),
        );
        expect(log.entries.every((row) => row.recipientMasked === null)).toBe(true);
      });
    });

    describe('SEC-01 supresión concurrente con el envío', () => {
      it('una supresión que bloquea la fila y confirma durante el envío deja RECHAZADO sin enviar', async () => {
        const titular = await seedTitular();
        const entry = await run(() =>
          emails.requestStatementEmail(titular.subscriber, {}, actorId),
        );
        expect(entry.recipientMasked).toBe('t***@e***.test');

        // Segunda conexión: el participante de supresión toma la fila y anonimiza al titular.
        const eraser = ds.createQueryRunner();
        await eraser.connect();
        try {
          await eraser.startTransaction();
          await eraser.query(`SET LOCAL search_path TO "${schemaName}", public`);
          await eraser.query(`SELECT id FROM billing_email_log WHERE id = $1 FOR UPDATE`, [
            entry.id,
          ]);
          await eraser.query(`UPDATE billing_email_log SET recipient_masked = NULL WHERE id = $1`, [
            entry.id,
          ]);
          await eraser.query(`UPDATE subscribers SET anonymized_at = now() WHERE id = $1`, [
            titular.subscriber,
          ]);

          const sending = processLast();
          // Espera a que el procesador quede esperando el bloqueo de la fila.
          let waiting = false;
          for (let attempt = 0; attempt < 200 && !waiting; attempt += 1) {
            const [row] = (await ds.query(
              `SELECT COUNT(*)::int AS total FROM pg_stat_activity
                WHERE wait_event_type = 'Lock' AND query LIKE '%billing_email_log%FOR UPDATE%'`,
            )) as Array<{ total: number }>;
            waiting = (row?.total ?? 0) > 0;
            if (!waiting) await new Promise((resolve) => setTimeout(resolve, 50));
          }
          expect(waiting).toBe(true);
          await eraser.commitTransaction();

          await expect(sending).resolves.toBe('RECHAZADO');
        } finally {
          if (eraser.isTransactionActive) await eraser.rollbackTransaction();
          await eraser.release();
        }
        expect(mailer.sendMail).not.toHaveBeenCalled();
        expect((await logRows(titular.subscriber))[0]).toMatchObject({
          status: 'RECHAZADO',
          reason_code: 'TITULAR_RESTRINGIDO',
          recipient_masked: null,
        });
      });

      it('DATOS_BLOQUEADOS aplicado entre la lectura inicial y el bloqueo: RECHAZADO sin enviar', async () => {
        const titular = await seedTitular();
        const document = await seedDocument(titular, {
          total: '25.00',
          issueDate: '2026-11-01',
          dueDate: '2026-11-15',
        });
        await run(() => emails.requestDocumentEmail(document, actorId));
        // El emisor se lee después de armar el adjunto y antes de bloquear la fila: ahí se bloquea.
        issuer.getIssuerIdentity.mockImplementationOnce(async () => {
          marks = { [titular.partyId]: ['DATOS_BLOQUEADOS'] };
          return { legalName: 'Operador sintético', nit: '900000000', verificationDigit: '1' };
        });
        await expect(processLast()).resolves.toBe('RECHAZADO');
        expect(mailer.sendMail).not.toHaveBeenCalled();
        expect((await logRows(titular.subscriber))[0]).toMatchObject({
          status: 'RECHAZADO',
          reason_code: 'TITULAR_RESTRINGIDO',
          recipient_masked: null,
        });
      });
    });

    it('SEC-04: un pago anulado después de encolar no envía el recibo', async () => {
      const titular = await seedTitular();
      const document = await seedDocument(titular, {
        total: '30.00',
        issueDate: '2026-11-01',
        dueDate: '2026-11-15',
      });
      const payment = await register(titular.subscriber, '30.00', '2026-11-03', [
        { documentId: document, amount: '30.00' },
      ]);
      await run(() =>
        emails.requestReceiptEmail(payment.id, actorId, { canSeeBlocked: false, actorId }),
      );
      await run(() => payments.voidPayment(payment.id, { reasonCode: 'DUPLICADO' }, actorId));
      await expect(processLast()).resolves.toBe('ERROR');
      expect(mailer.sendMail).not.toHaveBeenCalled();
      expect((await logRows(titular.subscriber))[0]).toMatchObject({
        status: 'ERROR',
        reason_code: 'FALLO_DE_ENVIO',
      });
    });

    it('borrar el documento arrastra sus filas del registro (FK en cascada)', async () => {
      const titular = await seedTitular();
      const document = await seedDocument(titular, {
        total: '10.00',
        issueDate: '2026-11-01',
        dueDate: '2026-11-15',
      });
      await run(() => emails.requestDocumentEmail(document, actorId));
      expect(await logRows(titular.subscriber)).toHaveLength(1);
      await sql(`DELETE FROM billing_documents WHERE id = $1`, [document]);
      expect(await logRows(titular.subscriber)).toHaveLength(0);
    });
  },
);
