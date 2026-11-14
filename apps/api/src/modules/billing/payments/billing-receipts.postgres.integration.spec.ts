import { randomUUID } from 'node:crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { dataSourceOptions, runInTenantSchema, TenantContext } from '@iwana/db';
import { BILLING_BLOCKED_BUYER_DISPLAY_NAME, BILLING_ERROR_CODES } from '@iwana/shared';
import PDFDocument from 'pdfkit';
import {
  billingPostgresIntegrationEnabled,
  dropBillingTenantFixture,
} from '../../../../../../packages/database/src/migrations/tenant/billing-migration.integration-helpers';
import { createBillingSchema } from '../billing-postgres.fixture';
import { BillingContractReadPort } from '../ports/billing-contract-read.port';
import { BillingPaymentsService } from './billing-payments.service';
import { BillingReceiptsService } from './billing-receipts.service';

/**
 * Spec MOD05↔MOD14 2026-11-13 bloque A contra PostgreSQL real (173…206 + 207 del fixture):
 * CA-3 recibo numerado, CA-5 desasociar, CA-7 rechazos sobre ANULADO e IMPORTADO, y la
 * protección del titular en el PDF (DATOS_BLOQUEADOS sin permiso, anonimizado).
 */
const describeDb = billingPostgresIntegrationEnabled ? describe : describe.skip;

type Fixture = Awaited<ReturnType<typeof createBillingSchema>>;

describeDb('Recibos y desasociar pagos (spec MOD05↔MOD14 2026-11-13, bloque A)', () => {
  let ds: DataSource;
  let fixture: Fixture | undefined;
  let schemaName: string;
  let tenantId: string;
  let payments: BillingPaymentsService;
  let receipts: BillingReceiptsService;
  const actorId = randomUUID();
  const events = new EventEmitter2();
  const emitted: string[] = [];
  const subscribers = new Map<string, { partyId: string; anonymized: boolean; name: string }>();
  let marks: Record<string, string[]> = {};
  const issuer = {
    getIssuerIdentity: jest.fn().mockResolvedValue({
      legalName: 'Operador sintético',
      nit: '900000000',
      verificationDigit: '1',
    }),
  };
  const audit = {
    logWithin: jest.fn(
      async (
        entry: { action: string; entityType: string; entityId: string; newValue?: unknown },
        manager: { query: (sql: string, args: unknown[]) => Promise<unknown> },
      ) => {
        await manager.query(
          `INSERT INTO test_receipts_audit (action, entity_type, entity_id, new_value)
           VALUES ($1, $2, $3, $4::jsonb)`,
          [entry.action, entry.entityType, entry.entityId, JSON.stringify(entry.newValue ?? null)],
        );
      },
    ),
  };
  const contractReadPort = {
    findTitularRefs: jest.fn(async (ids: string[]) =>
      ids
        .filter((id) => subscribers.has(id))
        .map((id) => ({
          subscriberId: id,
          partyId: subscribers.get(id)!.partyId,
          anonymized: subscribers.get(id)!.anonymized,
        })),
    ),
    findTitularDisplayNames: jest.fn(async (ids: string[]) =>
      ids
        .filter((id) => subscribers.has(id))
        .map((id) => ({ subscriberId: id, displayName: subscribers.get(id)!.name })),
    ),
    lockTitularForBillingWrite: jest.fn(async (id: string) => ({
      exists: subscribers.has(id),
      anonymized: subscribers.get(id)?.anonymized ?? false,
      withholdingAgent: false,
    })),
    hasImpersonationSuspension: jest.fn().mockResolvedValue(false),
    findActiveContractIds: jest.fn().mockResolvedValue([]),
  };
  const privacy = {
    activeMarks: jest.fn(async (ids: string[]) =>
      Object.fromEntries(ids.map((id) => [id, marks[id] ?? []])),
    ),
  };

  const context = () => ({ tenantId, schemaName, tenantSlug: 'receipts-fixture' });
  const run = <T>(fn: () => Promise<T>) => TenantContext.run(context(), fn);
  const sql = <T = Record<string, unknown>>(query: string, args: unknown[] = []) =>
    runInTenantSchema(ds, schemaName, (qr) => qr.query(query, args) as Promise<T[]>);
  const noAccess = { canSeeBlocked: false, actorId };

  /** Titular con contrato, periodo y documento EMITIDO de `total`. */
  async function seed(total = '100.00'): Promise<{
    subscriber: string;
    contract: string;
    period: string;
    document: string;
    partyId: string;
  }> {
    const subscriber = randomUUID();
    const contract = randomUUID();
    const period = randomUUID();
    const document = randomUUID();
    const partyId = randomUUID();
    subscribers.set(subscriber, { partyId, anonymized: false, name: 'Titular sintético' });
    await sql(
      `INSERT INTO contracts (id, tenant_id, subscriber_id, status, plan_snapshot_json)
       VALUES ($1, $2, $3, 'ACTIVE', '{}'::jsonb)`,
      [contract, tenantId, subscriber],
    );
    await sql(
      `INSERT INTO billing_periods (id, tenant_id, contract_id, subscriber_id, period_start,
         period_end, covered_start, generation_date, due_date, effective_policy)
       VALUES ($1, $2, $3, $4, '2026-11-01', '2026-11-30', '2026-11-01', '2026-11-01',
               '2026-11-14', '{}'::jsonb)`,
      [period, tenantId, contract, subscriber],
    );
    await sql(
      `INSERT INTO billing_documents (id, tenant_id, period_id, contract_id, subscriber_id, status,
         number, issue_date, due_date, subtotal, tax_total, total)
       VALUES ($1, $2, $3, $4, $5, 'EMITIDO', $6, '2026-11-01', '2026-11-14', $7, 0, $7)`,
      [document, tenantId, period, contract, subscriber, `DC-${document.slice(0, 8)}`, total],
    );
    return { subscriber, contract, period, document, partyId };
  }

  async function register(
    subscriber: string,
    key: string,
    amount = '100.00',
    allocations?: Array<{ documentId: string; amount: string }>,
  ) {
    return run(() =>
      payments.registerPayment(
        {
          subscriberId: subscriber,
          method: 'EFECTIVO',
          amount,
          paidAt: '2026-11-10',
          ...(allocations ? { allocations } : {}),
        },
        key,
        actorId,
      ),
    );
  }

  async function pending(document: string): Promise<string> {
    const [row] = await sql<{ pending: string }>(
      `SELECT (d.total - COALESCE((SELECT SUM(a.amount) FROM billing_payment_allocations a
                 WHERE a.document_id = d.id AND a.reversed_at IS NULL), 0))::numeric(14,2)::text
                 AS pending
         FROM billing_documents d WHERE d.id = $1`,
      [document],
    );
    return row!.pending;
  }

  async function signal(period: string): Promise<boolean | null> {
    const [row] = await sql<{ paid: boolean }>(
      `SELECT paid FROM billing_period_signals WHERE period_id = $1`,
      [period],
    );
    return row?.paid ?? null;
  }

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
    await sql(`CREATE TABLE test_receipts_audit (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), action text NOT NULL,
      entity_type text NOT NULL, entity_id text NOT NULL, new_value jsonb NULL)`);
    events.onAny((name) => emitted.push(String(name)));
    payments = new BillingPaymentsService(
      ds,
      contractReadPort as unknown as BillingContractReadPort,
      audit as never,
      events,
      privacy as never,
      { getSnapshot: jest.fn().mockResolvedValue({ timezone: 'America/Bogota' }) } as never,
    );
    receipts = new BillingReceiptsService(
      ds,
      payments,
      contractReadPort as unknown as BillingContractReadPort,
      issuer as never,
    );
  }, 120_000);

  afterAll(async () => {
    await dropBillingTenantFixture(ds, fixture);
    if (ds?.isInitialized) await ds.destroy();
  });

  beforeEach(() => {
    marks = {};
    emitted.length = 0;
  });

  describe('CA-3 recibo numerado', () => {
    it('numera consecutivo, la repetición idempotente conserva el número y el anulado también', async () => {
      const a = await seed();
      const b = await seed();
      const first = await register(a.subscriber, `ca3-${randomUUID()}`);
      const second = await register(b.subscriber, `ca3-${randomUUID()}`);
      expect(first.receiptNumber).toEqual(expect.any(Number));
      expect(first.imported).toBe(false);
      expect(first.externalId).toBeNull();
      expect(second.receiptNumber).toBe(first.receiptNumber! + 1);

      const key = `ca3-repeat-${randomUUID()}`;
      const original = await register(a.subscriber, key, '5.00', []);
      const [before] = await sql<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM billing_payments`,
      );
      const repeated = await register(a.subscriber, key, '5.00', []);
      const [after] = await sql<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM billing_payments`,
      );
      expect(repeated.id).toBe(original.id);
      expect(repeated.receiptNumber).toBe(original.receiptNumber);
      expect(after!.total).toBe(before!.total);

      const voided = await run(() =>
        payments.voidPayment(first.id, { reasonCode: 'ERROR_DE_REGISTRO' }, actorId),
      );
      expect(voided.status).toBe('ANULADO');
      expect(voided.receiptNumber).toBe(first.receiptNumber);
    });

    it('registros concurrentes de titulares distintos reciben números distintos y contiguos', async () => {
      const seeds = await Promise.all(Array.from({ length: 6 }, () => seed()));
      const [max] = await sql<{ max: string | null }>(
        `SELECT MAX(receipt_number)::text AS max FROM billing_payments`,
      );
      const base = Number(max?.max ?? 0);
      const results = await Promise.all(
        seeds.map((item) => register(item.subscriber, `ca3-par-${randomUUID()}`, '10.00')),
      );
      const numbers = results.map((item) => item.receiptNumber!).sort((x, y) => x - y);
      expect(numbers).toEqual(Array.from({ length: 6 }, (_, index) => base + index + 1));
    });

    it('el PDF lleva el número, las facturas cubiertas y la marca ANULADO', async () => {
      const text = jest.spyOn(PDFDocument.prototype, 'text');
      try {
        const seeded = await seed('150.00');
        const payment = await register(seeded.subscriber, `ca3-pdf-${randomUUID()}`, '200.00');
        const receipt = await run(() => receipts.receiptPdf(payment.id, noAccess));
        expect(receipt.receiptNumber).toBe(payment.receiptNumber);
        expect(receipt.filename).toBe(`recibo-${payment.receiptNumber}.pdf`);
        expect(receipt.content.subarray(0, 5).toString('latin1')).toBe('%PDF-');
        expect(receipt.content.toString('latin1')).toContain(
          `Recibo de pago ${payment.receiptNumber}`,
        );
        const drawn = text.mock.calls.map((args) => String(args[0])).join('\n');
        expect(drawn).toContain(`Recibo N.º ${payment.receiptNumber}`);
        expect(drawn).toContain(`DC-${seeded.document.slice(0, 8)}`);
        expect(drawn).toContain('Titular sintético');
        expect(drawn).toContain('Operador sintético');
        expect(drawn).toMatch(/Saldo a favor: .*50,00/u);
        expect(drawn).not.toContain('ANULADO');

        text.mockClear();
        await run(() => payments.voidPayment(payment.id, { reasonCode: 'DUPLICADO' }, actorId));
        const voided = await run(() => receipts.receiptPdf(payment.id, noAccess));
        expect(voided.receiptNumber).toBe(payment.receiptNumber);
        expect(voided.content.toString('latin1')).toContain(
          `Recibo de pago ${payment.receiptNumber} ANULADO`,
        );
        const voidedText = text.mock.calls.map((args) => String(args[0])).join('\n');
        expect(voidedText).toContain('ANULADO');
        // La factura que el pago cubría sigue en el recibo anulado.
        expect(voidedText).toContain(`DC-${seeded.document.slice(0, 8)}`);
        expect(voidedText).toContain('Saldo a favor: no aplica (pago anulado).');
      } finally {
        text.mockRestore();
      }
    });

    it('un pago importado no tiene número ni recibo y la 207 lo impide', async () => {
      const seeded = await seed();
      const id = randomUUID();
      await sql(
        `INSERT INTO billing_payments (id, tenant_id, subscriber_id, method, amount, paid_at,
           idempotency_key, created_by, external_id, import_batch_id)
         VALUES ($1, $2, $3, 'EFECTIVO', 10, '2023-01-01', $4, $5, $6, $7)`,
        [
          id,
          tenantId,
          seeded.subscriber,
          `import-${id}`,
          actorId,
          `uisp:payment:${id.slice(0, 8)}`,
          randomUUID(),
        ],
      );
      const read = await run(() => payments.getPayment(id, noAccess));
      expect(read).toMatchObject({
        receiptNumber: null,
        imported: true,
        externalId: `uisp:payment:${id.slice(0, 8)}`,
      });
      await expect(run(() => receipts.receiptPdf(id, noAccess))).rejects.toMatchObject({
        status: 409,
        response: { code: BILLING_ERROR_CODES.BILLING_RECEIPT_NOT_AVAILABLE },
      });
      await expect(
        sql(`UPDATE billing_payments SET receipt_number = 999999 WHERE id = $1`, [id]),
      ).rejects.toMatchObject({ constraint: 'chk_billing_payments_receipt_native' });
    });
  });

  describe('Privacidad del recibo', () => {
    it('con DATOS_BLOQUEADOS y sin permiso no pinta el nombre del titular', async () => {
      const text = jest.spyOn(PDFDocument.prototype, 'text');
      try {
        const seeded = await seed();
        const payment = await register(seeded.subscriber, `priv-${randomUUID()}`);
        marks = { [seeded.partyId]: ['DATOS_BLOQUEADOS'] };
        await run(() => receipts.receiptPdf(payment.id, noAccess));
        const drawn = text.mock.calls.map((args) => String(args[0])).join('\n');
        expect(drawn).toContain(BILLING_BLOCKED_BUYER_DISPLAY_NAME);
        expect(drawn).not.toContain('Titular sintético');
      } finally {
        text.mockRestore();
      }
    });

    it('con el titular anonimizado responde 404', async () => {
      const seeded = await seed();
      const payment = await register(seeded.subscriber, `anon-${randomUUID()}`);
      subscribers.set(seeded.subscriber, {
        ...subscribers.get(seeded.subscriber)!,
        anonymized: true,
      });
      await expect(run(() => receipts.receiptPdf(payment.id, noAccess))).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  describe('CA-5 desasociar', () => {
    it('deja la factura con saldo, el valor como saldo a favor, auditado y re-aplicable', async () => {
      const seeded = await seed('100.00');
      const payment = await register(seeded.subscriber, `ca5-${randomUUID()}`, '100.00', [
        { documentId: seeded.document, amount: '100.00' },
      ]);
      expect(await pending(seeded.document)).toBe('0.00');
      expect(await signal(seeded.period)).toBe(true);
      const allocation = payment.allocations![0]!;
      emitted.length = 0;

      const unlinked = await run(() =>
        payments.unlinkAllocation(
          payment.id,
          allocation.id,
          { reasonCode: 'APLICADO_A_DOCUMENTO_EQUIVOCADO' },
          actorId,
        ),
      );
      expect(unlinked.status).toBe('REGISTRADO');
      expect(unlinked.unallocatedAmount).toBe('100.00');
      expect(unlinked.allocations).toEqual([
        expect.objectContaining({
          id: allocation.id,
          reversedBy: actorId,
          reversalReasonCode: 'APLICADO_A_DOCUMENTO_EQUIVOCADO',
          reversedAt: expect.any(String),
        }),
      ]);
      expect(await pending(seeded.document)).toBe('100.00');
      expect(await signal(seeded.period)).toBe(false);
      expect(emitted).toContain('billing.contract-period.reopened');
      const [audited] = await sql<{ action: string; new_value: Record<string, unknown> }>(
        `SELECT action, new_value FROM test_receipts_audit
          WHERE entity_type = 'BillingPaymentAllocation' AND entity_id = $1`,
        [allocation.id],
      );
      expect(audited).toMatchObject({
        action: 'UPDATE',
        new_value: {
          status: 'DESASOCIADA',
          reasonCode: 'APLICADO_A_DOCUMENTO_EQUIVOCADO',
          documentId: seeded.document,
          amount: '100.00',
        },
      });

      // La misma aplicación ya no está vigente.
      await expect(
        run(() =>
          payments.unlinkAllocation(
            payment.id,
            allocation.id,
            { reasonCode: 'REASIGNACION' },
            actorId,
          ),
        ),
      ).rejects.toMatchObject({
        status: 404,
        response: { code: BILLING_ERROR_CODES.BILLING_ALLOCATION_NOT_FOUND },
      });

      const reapplied = await run(() =>
        payments.allocateCredit(
          payment.id,
          {
            subscriberId: seeded.subscriber,
            allocations: [{ paymentId: payment.id, documentId: seeded.document, amount: '100.00' }],
          },
          actorId,
        ),
      );
      expect(reapplied.unallocatedAmount).toBe('0.00');
      expect(await pending(seeded.document)).toBe('0.00');
      expect(await signal(seeded.period)).toBe(true);
      // El recibo muestra solo la aplicación vigente y conserva su número.
      expect(reapplied.receiptNumber).toBe(payment.receiptNumber);
    });

    it('rechaza un motivo fuera del dominio y la base lo impide también', async () => {
      const seeded = await seed();
      const payment = await register(seeded.subscriber, `ca5-bad-${randomUUID()}`);
      const allocation = payment.allocations![0]!;
      await expect(
        run(() =>
          payments.unlinkAllocation(payment.id, allocation.id, { reasonCode: 'OTRO' }, actorId),
        ),
      ).rejects.toMatchObject({ status: 422, response: { code: 'VALIDATION_ERROR' } });
      await expect(
        sql(
          `UPDATE billing_payment_allocations SET reversed_at = now(), reversal_reason_code = 'X'
            WHERE id = $1`,
          [allocation.id],
        ),
      ).rejects.toMatchObject({ constraint: 'chk_billing_allocations_reversal_reason_code' });
      await expect(
        sql(
          `UPDATE billing_payment_allocations SET reversal_reason_code = 'REASIGNACION'
            WHERE id = $1`,
          [allocation.id],
        ),
      ).rejects.toMatchObject({ constraint: 'chk_billing_allocations_reversal_reason_shape' });
    });

    it('rechaza desasociar con una retención vigente sobre el documento', async () => {
      const seeded = await seed('100.00');
      const payment = await register(seeded.subscriber, `ca5-wh-${randomUUID()}`, '100.00');
      await sql(
        `INSERT INTO billing_payment_withholdings (tenant_id, payment_id, document_id,
           subscriber_id, tax_code, base, rate, amount, certificate_number, created_by)
         VALUES ($1, $2, $3, $4, 'RETE_ICA', 100, 1, 1, NULL, $5)`,
        [tenantId, payment.id, seeded.document, seeded.subscriber, actorId],
      );
      await expect(
        run(() =>
          payments.unlinkAllocation(
            payment.id,
            payment.allocations![0]!.id,
            { reasonCode: 'VALOR_EQUIVOCADO' },
            actorId,
          ),
        ),
      ).rejects.toMatchObject({
        status: 422,
        response: { code: BILLING_ERROR_CODES.BILLING_ALLOCATION_HAS_WITHHOLDING },
      });
    });

    it('rechaza desasociar de un pago anulado', async () => {
      const seeded = await seed();
      const payment = await register(seeded.subscriber, `ca5-void-${randomUUID()}`);
      await run(() => payments.voidPayment(payment.id, { reasonCode: 'DUPLICADO' }, actorId));
      await expect(
        run(() =>
          payments.unlinkAllocation(
            payment.id,
            payment.allocations![0]!.id,
            { reasonCode: 'REASIGNACION' },
            actorId,
          ),
        ),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: BILLING_ERROR_CODES.BILLING_PAYMENT_VOIDED },
      });
    });
  });

  describe('CA-7 documentos ANULADO e IMPORTADO', () => {
    it('no desasocia de un documento ANULADO', async () => {
      const seeded = await seed();
      const payment = await register(seeded.subscriber, `ca7-void-${randomUUID()}`);
      await sql(
        `UPDATE billing_documents SET status = 'ANULADO', void_reason_code = 'ERROR_DE_VALOR',
           voided_at = now(), voided_by = $2 WHERE id = $1`,
        [seeded.document, actorId],
      );
      const allocation = payment.allocations![0]!;
      await expect(
        run(() =>
          payments.unlinkAllocation(
            payment.id,
            allocation.id,
            { reasonCode: 'REASIGNACION' },
            actorId,
          ),
        ),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: BILLING_ERROR_CODES.BILLING_ALLOCATION_NOT_UNLINKABLE },
      });
      const [row] = await sql<{ reversed_at: Date | null }>(
        `SELECT reversed_at FROM billing_payment_allocations WHERE id = $1`,
        [allocation.id],
      );
      expect(row!.reversed_at).toBeNull();
    });

    it('no desasocia de un documento IMPORTADO', async () => {
      const seeded = await seed();
      const importedDocument = randomUUID();
      await sql(
        `INSERT INTO billing_documents (id, tenant_id, period_id, contract_id, subscriber_id,
           status, external_number, due_date, subtotal, tax_total, total, external_id,
           import_batch_id)
         VALUES ($1, $2, NULL, $3, $4, 'IMPORTADO', 'UISP-0001', '2023-03-15', 50, 0, 50, $5, $6)`,
        [
          importedDocument,
          tenantId,
          seeded.contract,
          seeded.subscriber,
          `uisp:invoice:${importedDocument.slice(0, 8)}`,
          randomUUID(),
        ],
      );
      const payment = await register(seeded.subscriber, `ca7-imp-${randomUUID()}`, '20.00', [
        { documentId: seeded.document, amount: '20.00' },
      ]);
      // El fixture no instala la guarda de la 199: la aplicación se siembra directamente.
      const [allocation] = await sql<{ id: string }>(
        `INSERT INTO billing_payment_allocations (tenant_id, payment_id, document_id, amount,
           created_by)
         VALUES ($1, $2, $3, 0.01, $4) RETURNING id::text`,
        [tenantId, payment.id, importedDocument, actorId],
      );
      await expect(
        run(() =>
          payments.unlinkAllocation(
            payment.id,
            allocation!.id,
            { reasonCode: 'APLICADO_A_DOCUMENTO_EQUIVOCADO' },
            actorId,
          ),
        ),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: BILLING_ERROR_CODES.BILLING_ALLOCATION_NOT_UNLINKABLE },
      });
      const [row] = await sql<{ reversed_at: Date | null }>(
        `SELECT reversed_at FROM billing_payment_allocations WHERE id = $1`,
        [allocation!.id],
      );
      expect(row!.reversed_at).toBeNull();
    });
  });
});
