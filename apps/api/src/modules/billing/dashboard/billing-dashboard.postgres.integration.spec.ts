import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { dataSourceOptions, runInTenantSchema, TenantContext } from '@iwana/db';
import { BillingDashboardSummarySchema, type BillingDashboardSummary } from '@iwana/shared';
import { billingPostgresIntegrationEnabled } from '../../../../../../packages/database/src/migrations/tenant/billing-migration.integration-helpers';
import { BillingContractReadAdapter } from '../../crm/contracts/billing-contract-read.adapter';
import { createBillingSchema } from '../billing-postgres.fixture';
import { BillingDocumentsService } from '../documents/billing-documents.service';
import { BillingPaymentsService } from '../payments/billing-payments.service';
import { BillingDashboardService } from './billing-dashboard.service';

/**
 * N1 · `GET /billing/dashboard/summary` contra PostgreSQL real con la 173 y siguientes
 * (HLD-MOD02 v3.0 §3 N1, §7, §8.7 y §8.8). Reconcilia la cartera vencida con la lista de
 * documentos (`paymentState = 'VENCIDO'`) y mide el p95 sobre volumen sintético.
 */
const describeDb = billingPostgresIntegrationEnabled ? describe : describe.skip;

interface Tenant {
  tenantId: string;
  schemaName: string;
  timezone: string;
}

interface Owner {
  subscriber: string;
  contract: string;
}

type DocumentStatus = 'BORRADOR' | 'EMITIDO' | 'ANULADO' | 'IMPORTADO';

function cents(value: string): number {
  const [whole = '0', fraction = ''] = value.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0').slice(0, 2));
}

/** Fecha civil de hoy en `timeZone` desplazada `days` días. */
function civil(timeZone: string, days = 0): string {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const date = new Date(`${today}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function bucket(summary: BillingDashboardSummary, name: string) {
  return summary.overdue.buckets.find((item) => item.bucket === name);
}

function month(summary: BillingDashboardSummary, value: string) {
  return summary.series.find((item) => item.month === value);
}

// Presupuesto de latencia (HLD §7): el CI lo mide en un paso propio, en serie
// (`--runInBand`), porque la corrida paralela de 4 workers en un runner de 2
// núcleos mide la contención entre suites y no la consulta. Ese paso pone esta
// variable en la corrida paralela; en local, sin ella, la prueba corre siempre.
const itLatencyBudget = process.env['IWANA_IT_LATENCY_DEFERRED'] === '1' ? it.skip : it;
describeDb('N1 resumen de facturación del inicio (Postgres real)', () => {
  let ds: DataSource;
  let tenantA: Tenant;
  let tenantB: Tenant;
  let dashboard: BillingDashboardService;
  let documents: BillingDocumentsService;
  let sequence = 0;
  const actorId = randomUUID();
  const timezones = new Map<string, string>();
  const settings = {
    getSnapshot: jest.fn(async ({ tenantId }: { tenantId: string }) => ({
      timezone: timezones.get(tenantId) ?? 'America/Bogota',
      mfaRequiredAll: false,
      brandingCustomized: false,
    })),
  };
  const config = new ConfigService({
    PII_ENCRYPTION_KEY: '12'.repeat(32),
    MFA_ENCRYPTION_KEY: '12'.repeat(32),
    NODE_ENV: 'test',
  });

  const run = <T>(tenant: Tenant, fn: () => Promise<T>) =>
    TenantContext.run(
      { tenantId: tenant.tenantId, schemaName: tenant.schemaName, tenantSlug: 'n1-fixture' },
      fn,
    );
  const sql = <T = Record<string, unknown>>(tenant: Tenant, query: string, args: unknown[] = []) =>
    runInTenantSchema(ds, tenant.schemaName, (qr) => qr.query(query, args) as Promise<T[]>);

  async function owner(tenant: Tenant): Promise<Owner> {
    const subscriber = randomUUID();
    const contract = randomUUID();
    await sql(
      tenant,
      `INSERT INTO subscribers (id, tenant_id, party_id, person_type) VALUES ($1, $2, $3, 'NATURAL')`,
      [subscriber, tenant.tenantId, randomUUID()],
    );
    await sql(
      tenant,
      `INSERT INTO contracts (id, tenant_id, subscriber_id, status, plan_snapshot_json)
       VALUES ($1, $2, $3, 'ACTIVE', '{}'::jsonb)`,
      [contract, tenant.tenantId, subscriber],
    );
    return { subscriber, contract };
  }

  async function documentOf(
    tenant: Tenant,
    who: Owner,
    input: { status?: DocumentStatus; total: string; due: string; issue?: string | null },
  ): Promise<string> {
    const id = randomUUID();
    const status = input.status ?? 'EMITIDO';
    const issue = input.issue === undefined ? input.due : input.issue;
    sequence += 1;
    if (status === 'IMPORTADO') {
      await sql(
        tenant,
        `INSERT INTO billing_documents (id, tenant_id, period_id, contract_id, subscriber_id, status,
                                        external_number, issue_date, due_date, subtotal, tax_total,
                                        total, external_id, import_batch_id)
         VALUES ($1, $2, NULL, $3, $4, 'IMPORTADO', $5, $6, $7, $8, 0, $8, $9, $10)`,
        [
          id,
          tenant.tenantId,
          who.contract,
          who.subscriber,
          `UISP-${sequence}`,
          issue,
          input.due,
          input.total,
          `uisp:invoice:${id}`,
          randomUUID(),
        ],
      );
      return id;
    }
    const period = randomUUID();
    await sql(
      tenant,
      `INSERT INTO billing_periods (id, tenant_id, contract_id, subscriber_id, period_start,
                                    period_end, covered_start, generation_date, due_date,
                                    effective_policy)
       VALUES ($1, $2, $3, $4, '2000-01-01'::date + $5::int, '2000-01-01'::date + $5::int,
               '2000-01-01'::date + $5::int, '2000-01-01'::date + $5::int, $6, '{}'::jsonb)`,
      [period, tenant.tenantId, who.contract, who.subscriber, sequence, input.due],
    );
    await sql(
      tenant,
      `INSERT INTO billing_documents (id, tenant_id, period_id, contract_id, subscriber_id, status,
                                      number, issue_date, due_date, subtotal, tax_total, total,
                                      void_reason_code, voided_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, $10, $11, $12)`,
      [
        id,
        tenant.tenantId,
        period,
        who.contract,
        who.subscriber,
        status,
        status === 'BORRADOR' ? null : `DC-${sequence}`,
        status === 'BORRADOR' ? null : issue,
        input.due,
        input.total,
        status === 'ANULADO' ? 'ERROR_DE_VALOR' : null,
        status === 'ANULADO' ? new Date() : null,
      ],
    );
    return id;
  }

  async function payment(
    tenant: Tenant,
    who: Owner,
    input: {
      amount: string;
      paidAt: string;
      status?: 'REGISTRADO' | 'ANULADO';
      allocations?: Array<{ document: string; amount: string; reversed?: boolean }>;
    },
  ): Promise<void> {
    const id = randomUUID();
    const voided = input.status === 'ANULADO';
    await sql(
      tenant,
      `INSERT INTO billing_payments (id, tenant_id, subscriber_id, method, amount, paid_at,
                                     idempotency_key, status, void_reason_code, voided_at,
                                     voided_by, created_by)
       VALUES ($1, $2, $3, 'EFECTIVO', $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        id,
        tenant.tenantId,
        who.subscriber,
        input.amount,
        input.paidAt,
        `n1-${id}`,
        voided ? 'ANULADO' : 'REGISTRADO',
        voided ? 'ERROR_DE_REGISTRO' : null,
        voided ? new Date() : null,
        voided ? actorId : null,
        actorId,
      ],
    );
    for (const allocation of input.allocations ?? []) {
      await sql(
        tenant,
        `INSERT INTO billing_payment_allocations (tenant_id, payment_id, document_id, amount,
                                                  reversed_at, reversed_by, reversal_reason_code,
                                                  created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          tenant.tenantId,
          id,
          allocation.document,
          allocation.amount,
          allocation.reversed ? new Date() : null,
          allocation.reversed ? actorId : null,
          allocation.reversed ? 'VALOR_EQUIVOCADO' : null,
          actorId,
        ],
      );
    }
  }

  async function courtesy(
    tenant: Tenant,
    who: Owner,
    document: string,
    amount: string,
    status: 'ACTIVA' | 'ANULADA' = 'ACTIVA',
  ): Promise<void> {
    await sql(
      tenant,
      `INSERT INTO billing_courtesies (tenant_id, document_id, subscriber_id, application, target,
                                       amount, reason_code, status, void_reason_code, voided_at,
                                       idempotency_key, created_by)
       VALUES ($1, $2, $3, 'AJUSTE_SOBRE_EMITIDO', 'VALOR', $4, 'FALLA_DEL_SERVICIO', $5, $6, $7,
               $8, $9)`,
      [
        tenant.tenantId,
        document,
        who.subscriber,
        amount,
        status,
        status === 'ANULADA' ? 'DECISION_REVERTIDA' : null,
        status === 'ANULADA' ? new Date() : null,
        `n1-${randomUUID()}`,
        actorId,
      ],
    );
  }

  async function truncate(tenant: Tenant): Promise<void> {
    await sql(
      tenant,
      `TRUNCATE billing_courtesies, billing_payment_allocations, billing_payments,
                billing_documents, billing_periods, contracts, subscribers CASCADE`,
    );
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
    const a = await createBillingSchema(ds);
    const b = await createBillingSchema(ds);
    tenantA = { tenantId: a.tenantId, schemaName: a.schemaName, timezone: 'America/Bogota' };
    tenantB = { tenantId: b.tenantId, schemaName: b.schemaName, timezone: 'Asia/Tokyo' };
    timezones.set(tenantA.tenantId, tenantA.timezone);
    timezones.set(tenantB.tenantId, tenantB.timezone);
    const adapter = new BillingContractReadAdapter(ds, config, settings as never);
    const privacy = { activeMarks: jest.fn().mockResolvedValue({}) };
    const audit = { logWithin: jest.fn().mockResolvedValue(undefined) };
    const payments = new BillingPaymentsService(
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
      { getIssuerIdentity: jest.fn() } as never,
      config,
      { getEffectivePermissionsForUser: jest.fn().mockResolvedValue([]) } as never,
      settings as never,
      privacy as never,
      payments,
    );
    dashboard = new BillingDashboardService(ds, settings as never);
  });

  beforeEach(async () => {
    await truncate(tenantA);
    await truncate(tenantB);
  });

  afterAll(async () => {
    if (ds?.isInitialized) {
      for (const tenant of [tenantA, tenantB]) {
        if (!tenant) continue;
        await ds.query(`DROP SCHEMA IF EXISTS "${tenant.schemaName}" CASCADE`);
        await ds.query('DELETE FROM public.tenants WHERE id = $1', [tenant.tenantId]);
      }
      await ds.destroy();
    }
  });

  it('saldo vigente: pago anulado, imputación revertida, cortesía e IMPORTADO', async () => {
    // 2026-11-17 10:00 en Bogotá.
    const now = new Date('2026-11-17T15:00:00.000Z');
    const s1 = await owner(tenantA);
    const s2 = await owner(tenantA);
    const s3 = await owner(tenantA);
    const s4 = await owner(tenantA);

    // 1 día vencido, sin pagos: saldo 100.
    await documentOf(tenantA, s1, { total: '100.00', due: '2026-11-16', issue: '2026-11-02' });
    // 31 días: 50 pagados; el pago anulado de 70 no salda. Saldo 150.
    const partial = await documentOf(tenantA, s1, { total: '200.00', due: '2026-10-17' });
    await payment(tenantA, s1, {
      amount: '50.00',
      paidAt: '2026-11-05',
      allocations: [{ document: partial, amount: '50.00' }],
    });
    await payment(tenantA, s1, {
      amount: '70.00',
      paidAt: '2026-11-06',
      status: 'ANULADO',
      allocations: [{ document: partial, amount: '70.00' }],
    });
    // 61 días: imputación revertida de 300 no cuenta; la vigente de 100 sí. Saldo 200.
    const reversed = await documentOf(tenantA, s2, { total: '300.00', due: '2026-09-17' });
    await payment(tenantA, s2, {
      amount: '300.00',
      paidAt: '2026-09-20',
      allocations: [{ document: reversed, amount: '300.00', reversed: true }],
    });
    await payment(tenantA, s2, {
      amount: '100.00',
      paidAt: '2026-10-10',
      allocations: [{ document: reversed, amount: '100.00' }],
    });
    // Más de 90 días, IMPORTADO sin pagos: cuenta en cartera. Saldo 80.
    await documentOf(tenantA, s3, {
      status: 'IMPORTADO',
      total: '80.00',
      due: '2023-03-15',
      issue: '2023-03-01',
    });
    // Cortesía activa que salda: fuera. Cortesía anulada sobre otro: no salda.
    const courtesied = await documentOf(tenantA, s4, { total: '120.00', due: '2026-08-01' });
    await courtesy(tenantA, s4, courtesied, '120.00');
    const voidedCourtesy = await documentOf(tenantA, s4, { total: '40.00', due: '2026-08-02' });
    await courtesy(tenantA, s4, voidedCourtesy, '40.00', 'ANULADA');
    // Fuera de cartera: vence hoy, borrador vencido y anulado vencido.
    await documentOf(tenantA, s4, { total: '50.00', due: '2026-11-17', issue: '2026-11-17' });
    await documentOf(tenantA, s4, { status: 'BORRADOR', total: '999.00', due: '2026-10-01' });
    await documentOf(tenantA, s4, {
      status: 'ANULADO',
      total: '888.00',
      due: '2026-10-01',
      issue: '2026-11-03',
    });

    const summary = await run(tenantA, () => dashboard.summary(now));

    expect(BillingDashboardSummarySchema.safeParse(summary).success).toBe(true);
    expect(summary.asOf).toBe('2026-11-17');
    expect(summary.overdue).toEqual({
      amount: '570.00',
      documentCount: 5,
      subscriberCount: 4,
      buckets: [
        { bucket: '1_30', amount: '100.00', documentCount: 1 },
        { bucket: '31_60', amount: '150.00', documentCount: 1 },
        { bucket: '61_90', amount: '200.00', documentCount: 1 },
        { bucket: '90_plus', amount: '120.00', documentCount: 2 },
      ],
    });
    // Noviembre: 100 + 50 emitidos (el anulado y el borrador no); caja: 50 (el anulado no).
    expect(summary.invoicedAmount).toBe('150.00');
    expect(summary.collectedAmount).toBe('50.00');
    expect(month(summary, '2026-10')).toEqual({
      month: '2026-10',
      invoicedAmount: '200.00',
      collectedAmount: '100.00',
    });
    // El pago con la imputación revertida sigue siendo caja de septiembre.
    expect(month(summary, '2026-09')?.collectedAmount).toBe('300.00');
    // El IMPORTADO de 2023 queda fuera de los 12 meses.
    expect(summary.series[0]?.month).toBe('2025-12');
    expect(summary.series.map((item) => item.invoicedAmount).every((v) => v !== '80.00')).toBe(
      true,
    );
  });

  it('cada tramo de antigüedad respeta sus bordes (30/31, 60/61, 90/91)', async () => {
    const now = new Date('2026-11-17T15:00:00.000Z');
    const who = await owner(tenantA);
    const asOf = new Date('2026-11-17T00:00:00.000Z');
    for (const days of [1, 30, 31, 60, 61, 90, 91, 400]) {
      const due = new Date(asOf);
      due.setUTCDate(due.getUTCDate() - days);
      await documentOf(tenantA, who, { total: '10.00', due: due.toISOString().slice(0, 10) });
    }

    const summary = await run(tenantA, () => dashboard.summary(now));

    expect(summary.overdue.buckets).toEqual([
      { bucket: '1_30', amount: '20.00', documentCount: 2 },
      { bucket: '31_60', amount: '20.00', documentCount: 2 },
      { bucket: '61_90', amount: '20.00', documentCount: 2 },
      { bucket: '90_plus', amount: '20.00', documentCount: 2 },
    ]);
    expect(summary.overdue.subscriberCount).toBe(1);
  });

  it('el mes en curso y asOf siguen la zona horaria del tenant, no la del servidor', async () => {
    // Mismo instante: 2026-11-30 22:00 en Bogotá y 2026-12-01 07:00 en Tokio.
    const now = new Date('2026-12-01T03:00:00.000Z');
    const a = await owner(tenantA);
    const b = await owner(tenantB);
    for (const [tenant, who] of [
      [tenantA, a],
      [tenantB, b],
    ] as const) {
      await documentOf(tenant, who, { total: '30.00', due: '2026-12-20', issue: '2026-11-30' });
      await documentOf(tenant, who, { total: '1.00', due: '2026-12-20', issue: '2026-12-01' });
      await payment(tenant, who, { amount: '7.00', paidAt: '2026-11-30' });
      await payment(tenant, who, { amount: '9.00', paidAt: '2026-12-01' });
      // Primer día del horizonte de 12 meses de Bogotá y el día anterior.
      await documentOf(tenant, who, { total: '5.00', due: '2026-12-20', issue: '2025-12-01' });
      await documentOf(tenant, who, { total: '4.00', due: '2026-12-20', issue: '2025-11-30' });
      // Vence el 30 de noviembre: aún no vencido en Bogotá, vencido 1 día en Tokio.
      await documentOf(tenant, who, { total: '2.00', due: '2026-11-30', issue: '2026-10-30' });
    }

    const bogota = await run(tenantA, () => dashboard.summary(now));
    const tokyo = await run(tenantB, () => dashboard.summary(now));

    expect(bogota.asOf).toBe('2026-11-30');
    expect(bogota.invoicedAmount).toBe('30.00');
    expect(bogota.collectedAmount).toBe('7.00');
    expect(bogota.series[0]).toEqual({
      month: '2025-12',
      invoicedAmount: '5.00',
      collectedAmount: '0.00',
    });
    expect(bogota.series.at(-1)?.month).toBe('2026-11');
    expect(bogota.overdue.documentCount).toBe(0);

    expect(tokyo.asOf).toBe('2026-12-01');
    expect(tokyo.invoicedAmount).toBe('1.00');
    expect(tokyo.collectedAmount).toBe('9.00');
    expect(tokyo.series[0]?.month).toBe('2026-01');
    expect(month(tokyo, '2026-11')?.invoicedAmount).toBe('30.00');
    expect(month(tokyo, '2026-10')?.invoicedAmount).toBe('2.00');
    expect(bucket(tokyo, '1_30')).toEqual({ bucket: '1_30', amount: '2.00', documentCount: 1 });
  });

  it('dos tenants no se cruzan', async () => {
    const now = new Date('2026-11-17T15:00:00.000Z');
    timezones.set(tenantB.tenantId, 'America/Bogota');
    try {
      const a = await owner(tenantA);
      const b = await owner(tenantB);
      await documentOf(tenantA, a, { total: '11.00', due: '2026-11-01', issue: '2026-11-01' });
      await payment(tenantA, a, { amount: '3.00', paidAt: '2026-11-02' });
      await documentOf(tenantB, b, { total: '700.00', due: '2026-10-01', issue: '2026-11-01' });
      await documentOf(tenantB, b, { total: '900.00', due: '2026-09-01', issue: '2026-11-01' });
      await payment(tenantB, b, { amount: '500.00', paidAt: '2026-11-02' });

      const summaryA = await run(tenantA, () => dashboard.summary(now));
      const summaryB = await run(tenantB, () => dashboard.summary(now));

      expect([summaryA.invoicedAmount, summaryA.collectedAmount, summaryA.overdue.amount]).toEqual([
        '11.00',
        '3.00',
        '11.00',
      ]);
      expect(summaryA.overdue.documentCount).toBe(1);
      expect([summaryB.invoicedAmount, summaryB.collectedAmount, summaryB.overdue.amount]).toEqual([
        '1600.00',
        '500.00',
        '1600.00',
      ]);
      expect(summaryB.overdue.subscriberCount).toBe(1);
    } finally {
      timezones.set(tenantB.tenantId, tenantB.timezone);
    }
  });

  it('reconciliación: vencidos y saldo cuadran con la lista de documentos (VENCIDO)', async () => {
    const tz = tenantA.timezone;
    const owners = await Promise.all([owner(tenantA), owner(tenantA), owner(tenantA)]);
    const [o1, o2, o3] = owners as [Owner, Owner, Owner];
    const d1 = await documentOf(tenantA, o1, { total: '100.00', due: civil(tz, -5) });
    await payment(tenantA, o1, {
      amount: '40.00',
      paidAt: civil(tz, -2),
      allocations: [{ document: d1, amount: '40.00' }],
    });
    await payment(tenantA, o1, {
      amount: '60.00',
      paidAt: civil(tz, -1),
      status: 'ANULADO',
      allocations: [{ document: d1, amount: '60.00' }],
    });
    const d2 = await documentOf(tenantA, o2, { total: '250.00', due: civil(tz, -45) });
    await payment(tenantA, o2, {
      amount: '250.00',
      paidAt: civil(tz, -40),
      allocations: [{ document: d2, amount: '250.00', reversed: true }],
    });
    await courtesy(tenantA, o2, d2, '25.50');
    const d3 = await documentOf(tenantA, o2, { total: '90.00', due: civil(tz, -70) });
    await courtesy(tenantA, o2, d3, '90.00');
    await documentOf(tenantA, o3, {
      status: 'IMPORTADO',
      total: '33.33',
      due: civil(tz, -400),
      issue: civil(tz, -420),
    });
    await documentOf(tenantA, o3, { total: '15.00', due: civil(tz, 0) });
    await documentOf(tenantA, o3, { status: 'BORRADOR', total: '15.00', due: civil(tz, -3) });
    const paid = await documentOf(tenantA, o3, { total: '20.00', due: civil(tz, -10) });
    await payment(tenantA, o3, {
      amount: '20.00',
      paidAt: civil(tz, -9),
      allocations: [{ document: paid, amount: '20.00' }],
    });

    const summary = await run(tenantA, () => dashboard.summary());
    const list = await run(tenantA, () =>
      documents.list({ page: 1, limit: 100, paymentState: 'VENCIDO' }, actorId),
    );

    expect(list.total).toBe(list.data.length);
    expect(summary.overdue.documentCount).toBe(list.total);
    expect(cents(summary.overdue.amount)).toBe(
      list.data.reduce((sum, item) => sum + cents(item.pendingAmount ?? '0'), 0),
    );
    expect(summary.overdue.subscriberCount).toBe(
      new Set(list.data.map((item) => item.subscriberId)).size,
    );
    // Cifras esperadas: 60 + 224.50 + 33.33 en tres documentos de dos titulares.
    expect(summary.overdue.documentCount).toBe(3);
    expect(summary.overdue.amount).toBe('317.83');
  });

  itLatencyBudget('p95 de N1 con volumen sintético ≤ 300 ms (HLD §7)', async () => {
    const subscribers = 1000;
    const periodsPerContract = 12;
    await sql(
      tenantA,
      `WITH s AS (
         INSERT INTO subscribers (id, tenant_id, person_type)
         SELECT gen_random_uuid(), $1, 'NATURAL' FROM generate_series(1, $2)
         RETURNING id
       )
       INSERT INTO contracts (id, tenant_id, subscriber_id, status, plan_snapshot_json)
       SELECT gen_random_uuid(), $1, id, 'ACTIVE', '{}'::jsonb FROM s`,
      [tenantA.tenantId, subscribers],
    );
    await sql(
      tenantA,
      `INSERT INTO billing_periods (tenant_id, contract_id, subscriber_id, period_start, period_end,
                                    covered_start, generation_date, due_date, effective_policy)
       SELECT $1, c.id, c.subscriber_id, ps, ps + 29, ps, ps, ps + 14, '{}'::jsonb
         FROM contracts c,
              generate_series(0, $2 - 1) AS k,
              LATERAL (SELECT (date '2025-12-01' + make_interval(months => k))::date AS ps) x`,
      [tenantA.tenantId, periodsPerContract],
    );
    await sql(
      tenantA,
      `INSERT INTO billing_documents (tenant_id, period_id, contract_id, subscriber_id, status,
                                      number, issue_date, due_date, subtotal, tax_total, total)
       SELECT p.tenant_id, p.id, p.contract_id, p.subscriber_id, 'EMITIDO',
              'DC-' || row_number() OVER (), p.period_start, p.due_date, 0, 0,
              (50000 + (row_number() OVER () % 7) * 1000)::numeric(14,2)
         FROM billing_periods p`,
    );
    // Dos de cada tres documentos con pago; uno de cada diez pagos anulado; una cortesía de cada
    // veinte; una imputación revertida de cada quince.
    await sql(
      tenantA,
      `WITH docs AS MATERIALIZED (
         SELECT d.id, d.subscriber_id, d.total, d.due_date, gen_random_uuid() AS payment_id,
                row_number() OVER (ORDER BY d.id) AS rn
           FROM billing_documents d
       ),
       paid AS (
         INSERT INTO billing_payments (id, tenant_id, subscriber_id, method, amount, paid_at,
                                       idempotency_key, status, created_by)
         SELECT payment_id, $1, subscriber_id, 'TRANSFERENCIA',
                CASE WHEN rn % 4 = 0 THEN total / 2 ELSE total END, due_date - 2,
                'bulk-' || rn, CASE WHEN rn % 10 = 0 THEN 'ANULADO' ELSE 'REGISTRADO' END, $2
           FROM docs WHERE rn % 3 <> 0
         RETURNING id
       )
       INSERT INTO billing_payment_allocations (tenant_id, payment_id, document_id, amount,
                                                reversed_at, reversed_by, reversal_reason_code)
       SELECT $1, docs.payment_id, docs.id,
              CASE WHEN rn % 4 = 0 THEN total / 2 ELSE total END,
              CASE WHEN rn % 15 = 0 THEN now() END,
              CASE WHEN rn % 15 = 0 THEN $2::uuid END,
              CASE WHEN rn % 15 = 0 THEN 'VALOR_EQUIVOCADO' END
         FROM docs JOIN paid ON paid.id = docs.payment_id`,
      [tenantA.tenantId, actorId],
    );
    await sql(
      tenantA,
      `INSERT INTO billing_courtesies (tenant_id, document_id, subscriber_id, application, target,
                                       amount, reason_code, idempotency_key, created_by)
       SELECT d.tenant_id, d.id, d.subscriber_id, 'AJUSTE_SOBRE_EMITIDO', 'VALOR', 1000,
              'FALLA_DEL_SERVICIO', 'bulk-c-' || d.id, $1
         FROM billing_documents d
        WHERE ('x' || substr(d.id::text, 1, 8))::bit(32)::int % 20 = 0`,
      [actorId],
    );
    await sql(
      tenantA,
      'ANALYZE billing_documents, billing_payments, billing_payment_allocations, billing_courtesies',
    );
    const [volume] = await sql<{ documents: number; payments: number }>(
      tenantA,
      `SELECT (SELECT count(*) FROM billing_documents)::int AS documents,
              (SELECT count(*) FROM billing_payments)::int AS payments`,
    );

    const now = new Date('2026-11-17T15:00:00.000Z');
    for (let warm = 0; warm < 3; warm += 1) await run(tenantA, () => dashboard.summary(now));
    const samples: number[] = [];
    let last: BillingDashboardSummary | undefined;
    for (let i = 0; i < 40; i += 1) {
      const started = process.hrtime.bigint();
      last = await run(tenantA, () => dashboard.summary(now));
      samples.push(Number(process.hrtime.bigint() - started) / 1e6);
    }
    samples.sort((x, y) => x - y);
    const p95 = samples[Math.ceil(samples.length * 0.95) - 1]!;
    const p50 = samples[Math.ceil(samples.length * 0.5) - 1]!;
    // Solo tiempos y volumen; ningún monto en la salida.
    console.info(
      `[N1 p95] documentos=${volume?.documents} pagos=${volume?.payments} muestras=${samples.length} ` +
        `p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms max=${samples.at(-1)!.toFixed(1)}ms`,
    );

    expect(volume?.documents).toBe(subscribers * periodsPerContract);
    expect(last && BillingDashboardSummarySchema.safeParse(last).success).toBe(true);
    expect(last!.overdue.documentCount).toBeGreaterThan(0);
    expect(p95).toBeLessThanOrEqual(300);
  });
});
