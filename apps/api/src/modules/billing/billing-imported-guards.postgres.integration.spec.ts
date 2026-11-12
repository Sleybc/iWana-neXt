import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { dataSourceOptions, runInTenantSchema, TenantContext } from '@iwana/db';
import { BILLING_ERROR_CODES } from '@iwana/shared';
import { billingPostgresIntegrationEnabled } from '../../../../../packages/database/src/migrations/tenant/billing-migration.integration-helpers';
import { BillingContractReadAdapter } from '../crm/contracts/billing-contract-read.adapter';
import { createBillingSchema } from './billing-postgres.fixture';
import { BillingDocumentsService } from './documents/billing-documents.service';
import { BillingGenerationService } from './generation/billing-generation.service';
import { BillingPaymentsService } from './payments/billing-payments.service';

/**
 * ADR-110 D5 / spec UISP CA-4 — un documento de cobro `IMPORTADO` no se emite, no consume
 * la numeración, no dispara eventos de periodo y no se anula. Se ejercita el servicio real de
 * MOD14 sobre la 173 + 193 + 197 reales.
 */
const describeDb = billingPostgresIntegrationEnabled ? describe : describe.skip;

describeDb('MOD14 excluye los documentos IMPORTADO (ADR-110 D5)', () => {
  let ds: DataSource;
  let schemaName: string;
  let tenantId: string;
  let generation: BillingGenerationService;
  let documents: BillingDocumentsService;
  let payments: BillingPaymentsService;
  const actorId = randomUUID();
  const settings = { getSnapshot: jest.fn().mockResolvedValue({ timezone: 'America/Bogota' }) };
  const audit = { logWithin: jest.fn().mockResolvedValue(undefined) };
  const permissions = {
    getEffectivePermissionsForUser: jest.fn().mockResolvedValue([] as string[]),
  };
  const privacy = { activeMarks: jest.fn().mockResolvedValue({}) };
  const issuer = {
    getIssuerIdentity: jest.fn().mockResolvedValue({
      legalName: 'Operador sintético',
      nit: '900000000',
      verificationDigit: null,
    }),
  };
  const events = new EventEmitter2();
  const emitted: string[] = [];
  const config = new ConfigService({
    PII_ENCRYPTION_KEY: '12'.repeat(32),
    MFA_ENCRYPTION_KEY: '12'.repeat(32),
    NODE_ENV: 'test',
  });
  const context = () => ({ tenantId, schemaName, tenantSlug: 'imported-guards-fixture' });
  const run = <T>(fn: () => Promise<T>) => TenantContext.run(context(), fn);
  const sql = <T = Record<string, unknown>>(query: string, args: unknown[] = []) =>
    runInTenantSchema(ds, schemaName, (qr) => qr.query(query, args) as Promise<T[]>);

  async function seed(): Promise<{ id: string; subscriber: string }> {
    const id = randomUUID();
    const subscriber = randomUUID();
    await sql(
      `INSERT INTO subscribers (id,tenant_id,party_id,person_type,document_type,business_name)
       VALUES ($1,$2,$3,'JURIDICA','NIT','Titular sintético')`,
      [subscriber, tenantId, randomUUID()],
    );
    await sql(
      `INSERT INTO contracts (id,tenant_id,subscriber_id,status,billing_cycle_day,start_date,
                              plan_snapshot_json,vat_snapshot,fiscal_document)
       VALUES ($1,$2,$3,'ACTIVE',5,'2026-10-05',$4::jsonb,$5::jsonb,'900000001')`,
      [
        id,
        tenantId,
        subscriber,
        JSON.stringify({ name: 'Plan sintético', monthlyPrice: '100.00' }),
        JSON.stringify({
          treatment: 'STANDARD',
          legalBasis: 'ET-468',
          ratePercent: 19,
          requiresAccountantReview: false,
          resolvedAt: '2026-10-01T00:00:00Z',
        }),
      ],
    );
    return { id, subscriber };
  }

  async function draft(contractId: string, date = '2026-11-05'): Promise<string> {
    await run(() => generation.generate({ contractId, date, actorId }));
    const [row] = await sql<{ id: string }>(
      `SELECT id FROM billing_documents WHERE contract_id=$1 AND status='BORRADOR'`,
      [contractId],
    );
    if (!row) throw new Error('No se creó el borrador de fixture');
    return row.id;
  }

  /** Documento histórico importado; `periodId` opcional (D5: puede no tener periodo). */
  async function imported(
    contract: { id: string; subscriber: string },
    periodId: string | null = null,
  ): Promise<string> {
    const id = randomUUID();
    await sql(
      `INSERT INTO billing_documents (id,tenant_id,period_id,contract_id,subscriber_id,status,
                                      external_number,due_date,subtotal,tax_total,total,
                                      external_id,import_batch_id)
       VALUES ($1,$2,$3,$4,$5,'IMPORTADO','UISP-2023-0099','2023-03-15',80,0,80,$6,$7)`,
      [
        id,
        tenantId,
        periodId,
        contract.id,
        contract.subscriber,
        `uisp:invoice:${id.slice(0, 8)}`,
        randomUUID(),
      ],
    );
    return id;
  }

  async function syntheticPeriod(contract: { id: string; subscriber: string }): Promise<string> {
    const id = randomUUID();
    await sql(
      `INSERT INTO billing_periods (id,tenant_id,contract_id,subscriber_id,period_start,period_end,
                                    covered_start,generation_date,due_date,effective_policy)
       VALUES ($1,$2,$3,$4,'2023-03-01','2023-03-31','2023-03-01','2023-03-01','2023-03-15','{}'::jsonb)`,
      [id, tenantId, contract.id, contract.subscriber],
    );
    return id;
  }

  beforeAll(async () => {
    ds = new DataSource({
      ...dataSourceOptions,
      entities: [],
      migrations: [],
      logging: false,
      extra: { max: 10, connectionTimeoutMillis: 3000 },
    });
    await ds.initialize();
    const fixture = await createBillingSchema(ds);
    schemaName = fixture.schemaName;
    tenantId = fixture.tenantId;
    const adapter = new BillingContractReadAdapter(ds, config, settings as never);
    payments = new BillingPaymentsService(
      ds,
      adapter,
      audit as never,
      events,
      privacy as never,
      settings as never,
    );
    documents = new BillingDocumentsService(
      ds,
      audit as never,
      adapter,
      issuer as never,
      config,
      permissions as never,
      settings as never,
      privacy as never,
      payments,
    );
    generation = new BillingGenerationService(
      ds,
      adapter,
      settings as never,
      documents,
      audit as never,
      privacy as never,
    );
    events.onAny((event) => {
      emitted.push(String(event));
    });
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    emitted.length = 0;
    await sql(
      'TRUNCATE billing_period_signals,billing_payment_allocations,billing_payments,billing_documents,billing_periods,billing_contract_policy,contracts,subscribers CASCADE',
    );
    await sql(
      `UPDATE billing_policy SET period_timing='VENCIDO',cutoff_mode='VENCIMIENTO_MAS_GRACIA',first_period_mode='SEPARADO',approval_mode='BORRADOR',auto_apply_credit=true,proration_method='DIAS_REALES'`,
    );
  });

  afterAll(async () => {
    if (ds?.isInitialized) {
      await ds.query(`DROP SCHEMA "${schemaName}" CASCADE`);
      await ds.query('DELETE FROM public.tenants WHERE id=$1', [tenantId]);
      await ds.destroy();
    }
  });

  it('emisión: un IMPORTADO no se emite, con o sin periodo, y no cambia', async () => {
    const contract = await seed();
    const withoutPeriod = await imported(contract);
    const withPeriod = await imported(contract, await syntheticPeriod(contract));

    // ADR-110 bloque C: el IMPORTADO sin periodo ya es visible (LEFT JOIN de cartera); la
    // emisión lo rechaza por estado, igual que al que tiene periodo.
    await expect(run(() => documents.issue([withoutPeriod], actorId))).rejects.toMatchObject({
      response: { code: BILLING_ERROR_CODES.BILLING_DOCUMENT_NOT_DRAFT },
    });
    await expect(run(() => documents.issue([withPeriod], actorId))).rejects.toMatchObject({
      response: { code: BILLING_ERROR_CODES.BILLING_DOCUMENT_NOT_DRAFT },
    });
    expect(
      await sql<{ status: string; number: string | null }>(
        `SELECT status, number FROM billing_documents WHERE status='IMPORTADO' ORDER BY id`,
      ),
    ).toEqual([
      { status: 'IMPORTADO', number: null },
      { status: 'IMPORTADO', number: null },
    ]);
    expect(emitted).toEqual([]);
  });

  it('numeración: los importados no consumen ni desplazan el consecutivo DC', async () => {
    const contract = await seed();
    await imported(contract);
    await imported(contract);
    const id = await draft(contract.id);
    const [issued] = await run(() => documents.issue([id], actorId));
    expect(issued?.number).toBe('DC-000001');
  });

  it('anulación: un IMPORTADO no se anula ni por servicio ni por SQL directo', async () => {
    const contract = await seed();
    const id = await imported(contract, await syntheticPeriod(contract));
    await expect(
      run(() => documents.void(id, 'ERROR_DE_VALOR', undefined, actorId)),
    ).rejects.toMatchObject({
      response: { code: BILLING_ERROR_CODES.BILLING_DOCUMENT_NOT_ISSUED },
    });
    await expect(
      sql(`UPDATE billing_documents SET status='ANULADO', voided_at=now() WHERE id=$1`, [id]),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
    expect(await sql(`SELECT status FROM billing_documents WHERE id=$1`, [id])).toEqual([
      { status: 'IMPORTADO' },
    ]);
    expect(emitted).toEqual([]);
  });

  it('D14: un pago nuevo sí cubre un IMPORTADO (explícito o FIFO) sin emitir «paid»', async () => {
    const contract = await seed();
    const id = await imported(contract, await syntheticPeriod(contract));
    // ADR-110 D14: la deuda importada es cobrable; antes esto era BILLING_DOCUMENT_NOT_ISSUED.
    await run(() =>
      payments.registerPayment(
        {
          subscriberId: contract.subscriber,
          amount: '50.00',
          method: 'TRANSFERENCIA',
          paidAt: '2026-11-05',
          allocations: [{ documentId: id, amount: '50.00' }],
        },
        'imported-explicit',
        actorId,
      ),
    );
    await run(() =>
      payments.registerPayment(
        {
          subscriberId: contract.subscriber,
          amount: '80.00',
          method: 'TRANSFERENCIA',
          paidAt: '2026-11-05',
        },
        'imported-fifo',
        actorId,
      ),
    );
    expect(
      await sql(
        'SELECT document_id::text, amount::text FROM billing_payment_allocations ORDER BY amount DESC',
      ),
    ).toEqual([
      { document_id: id, amount: '50.00' },
      { document_id: id, amount: '30.00' },
    ]);
    expect(emitted.filter((event) => JSON.stringify(event).includes('paid'))).toEqual([]);
  });

  it('eventos: recalcular un periodo con solo un IMPORTADO pagado no emite «paid»', async () => {
    const contract = await seed();
    const periodId = await syntheticPeriod(contract);
    const documentId = await imported(contract, periodId);
    const paymentId = randomUUID();
    await sql(
      `INSERT INTO billing_payments (id,tenant_id,subscriber_id,method,amount,paid_at,idempotency_key,
                                     created_by,external_id,import_batch_id)
       VALUES ($1,$2,$3,'EFECTIVO',80,'2023-03-20','uisp-payment-1',$4,'uisp:payment:1',$5)`,
      [paymentId, tenantId, contract.subscriber, actorId, randomUUID()],
    );
    await sql(
      `INSERT INTO billing_payment_allocations (tenant_id,payment_id,document_id,amount)
       VALUES ($1,$2,$3,80)`,
      [tenantId, paymentId, documentId],
    );

    const recalculated = await runInTenantSchema(ds, schemaName, (qr) =>
      payments.recalculateSignals(qr.manager, tenantId, [periodId]),
    );
    expect(recalculated).toEqual([]);
    expect(await sql('SELECT paid FROM billing_period_signals')).toEqual([{ paid: false }]);

    // Señal forzada: si anular el pago recalculara el periodo del IMPORTADO, emitiría «reopened».
    await sql('UPDATE billing_period_signals SET paid = true WHERE period_id = $1', [periodId]);
    await run(() => payments.voidPayment(paymentId, { reasonCode: 'ERROR_DE_REGISTRO' }, actorId));
    expect(emitted).toEqual([]);
    expect(await sql('SELECT paid FROM billing_period_signals')).toEqual([{ paid: true }]);
    expect(await sql(`SELECT status FROM billing_documents WHERE id=$1`, [documentId])).toEqual([
      { status: 'IMPORTADO' },
    ]);
  });
  it('cartera: el listado y el estado de cuenta incluyen el IMPORTADO sin periodo', async () => {
    const contract = await seed();
    const documentId = await imported(contract);
    const listed = await run(() =>
      documents.list({ page: 1, limit: 20, subscriberId: contract.subscriber }, actorId),
    );
    expect(listed.total).toBe(1);
    expect(listed.data[0]).toMatchObject({
      id: documentId,
      status: 'IMPORTADO',
      number: null,
      externalNumber: 'UISP-2023-0099',
      periodId: null,
      periodStart: null,
      paymentState: 'VENCIDO',
      pendingAmount: '80.00',
    });
    const pending = await run(() =>
      documents.list({ page: 1, limit: 20, paymentState: 'VENCIDO' }, actorId),
    );
    expect(pending.data.map((row) => row.id)).toEqual([documentId]);

    const statement = await run(() =>
      payments.statementForSubscriber(contract.subscriber, actorId),
    );
    expect(statement).toMatchObject({
      totalInvoiced: '80.00',
      totalPaid: '0.00',
      totalPending: '80.00',
    });
    expect(statement.documents).toEqual([
      expect.objectContaining({ id: documentId, status: 'IMPORTADO', periodStart: null }),
    ]);
    // Decisión del bloque C: un IMPORTADO no es un cobro emitido de iWana. El contrato importado
    // sigue «sin cobros» para que «Generar primer cobro» ancle su ciclo; si no, nunca se facturaría.
    expect(statement.contractSummaries).toEqual([
      expect.objectContaining({
        contractId: contract.id,
        totalInvoiced: '80.00',
        billingNotStarted: true,
      }),
    ]);
  });
});
