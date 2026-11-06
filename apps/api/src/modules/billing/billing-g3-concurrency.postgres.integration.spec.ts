import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Tenant, TenantContext, dataSourceOptions, runInTenantSchema } from '@iwana/db';
import { TenantStatus } from '@iwana/shared';
import type { Job } from 'bullmq';
import { DataSource } from 'typeorm';
import { TenantLifecycleReadAdapter } from '../tenant/ports/tenant-lifecycle-read.adapter';
import { createFiscalDocumentCrypto } from '../../common/crypto/fiscal-document.util';
import { BillingContractReadAdapter } from '../crm/contracts/billing-contract-read.adapter';
import { createBillingSchema } from './billing-postgres.fixture';
import { BillingDocumentsService } from './documents/billing-documents.service';
import { BILLING_GENERATION_JOB } from './generation/billing-generation.constants';
import { BillingGenerationProcessor } from './generation/billing-generation.processor';
import { BillingGenerationService } from './generation/billing-generation.service';
import { BillingPaymentsService, type PeriodEvent } from './payments/billing-payments.service';
import { BillingIssuerReadPort } from './ports/billing-issuer-read.port';
import { IPrivacyMarksReadPort } from '../privacy/ports/privacy-marks-read.port';
import { SettingsPriorityTenantReadPort } from '../tenant/ports/settings-priority-tenant-read.port';
import { EffectivePermissionsService } from '../access-control/services/effective-permissions.service';
import { billingPostgresIntegrationEnabled } from '../../../../../packages/database/src/migrations/tenant/billing-migration.integration-helpers';
import { dropBillingTenantFixture } from '../../../../../packages/database/src/migrations/tenant/billing-migration.integration-helpers';

const describeDb = billingPostgresIntegrationEnabled ? describe : describe.skip;
const describeWithTimeout = 30_000;

type SeededSubscriber = { id: string; partyId: string };
type SeededContract = { id: string; subscriberId: string };
type PersistedCounts = { total: number; active: number; amount: string | null };

describeDb('Billing concurrencia contra PostgreSQL real, migración 173 y pool 10', () => {
  let dataSource: DataSource;
  let billingFixture: Awaited<ReturnType<typeof createBillingSchema>> | undefined;
  let schemaName: string;
  let tenantId: string;
  let adapter: BillingContractReadAdapter;
  let generation: BillingGenerationService;
  let documents: BillingDocumentsService;
  let payments: BillingPaymentsService;
  let processor: BillingGenerationProcessor;

  const actorId = randomUUID();
  const events = new EventEmitter2();
  const paidEvents: PeriodEvent['payload'][] = [];
  const reopenedEvents: PeriodEvent['payload'][] = [];
  const settings = {
    getSnapshot: jest.fn().mockResolvedValue({
      timezone: 'America/Bogota',
      mfaRequiredAll: false,
      brandingCustomized: false,
    }),
  };
  const audit = {
    logWithin: jest.fn().mockResolvedValue(undefined),
  };
  const privacy = {
    activeMarks: jest.fn().mockResolvedValue({}),
  } as unknown as IPrivacyMarksReadPort;
  const issuer = {
    getIssuerIdentity: jest.fn().mockResolvedValue({
      legalName: 'Operador sintético',
      nit: '900000000',
      verificationDigit: null,
    }),
  } as unknown as BillingIssuerReadPort;
  const permissions = {
    getEffectivePermissionsForUser: jest.fn().mockResolvedValue([]),
  } as unknown as EffectivePermissionsService;
  const config = new ConfigService({
    PII_ENCRYPTION_KEY: '12'.repeat(32),
    MFA_ENCRYPTION_KEY: '12'.repeat(32),
    PII_HASH_KEY: '34'.repeat(32),
    NODE_ENV: 'test',
  });
  const fiscalCrypto = createFiscalDocumentCrypto(config);

  const context = () => ({ tenantId, schemaName, tenantSlug: 'g3-fixture' });
  const inTenant = <T>(fn: () => Promise<T>) => TenantContext.run(context(), fn);
  const sql = <T = Record<string, unknown>>(query: string, values: unknown[] = []) =>
    runInTenantSchema(
      dataSource,
      schemaName,
      (queryRunner) => queryRunner.query(query, values) as Promise<T[]>,
    );

  function localDateInBogota(date = new Date()): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const part = (key: string) => parts.find((value) => value.type === key)?.value;
    const year = part('year');
    const month = part('month');
    const day = part('day');
    if (!year || !month || !day) throw new RangeError('No se resolvió la fecha civil de prueba.');
    return `${year}-${month}-${day}`;
  }

  async function createSubscriber(): Promise<SeededSubscriber> {
    const subscriber = { id: randomUUID(), partyId: randomUUID() };
    await sql(
      `INSERT INTO subscribers (
         id, tenant_id, party_id, person_type, document_type, business_name
       ) VALUES ($1, $2, $3, 'JURIDICA', 'NIT', 'Titular sintético')`,
      [subscriber.id, tenantId, subscriber.partyId],
    );
    return subscriber;
  }

  async function createContract(
    subscriberId: string,
    input: { startDate?: string; cycleDay?: number; monthlyPrice?: string } = {},
  ): Promise<SeededContract> {
    const id = randomUUID();
    const fiscalDocument = `900${id.replaceAll('-', '').slice(0, 6)}`;
    const encryptedFiscalDocument = fiscalCrypto.encrypt(fiscalDocument)?.encrypted ?? null;
    await sql(
      `INSERT INTO contracts (
         id, tenant_id, subscriber_id, status, billing_cycle_day, start_date,
         plan_snapshot_json, vat_snapshot, fiscal_document, fiscal_document_encrypted
       ) VALUES (
         $1, $2, $3, 'ACTIVE', $4, $5, $6::jsonb, $7::jsonb, NULL, $8
       )`,
      [
        id,
        tenantId,
        subscriberId,
        input.cycleDay ?? 5,
        input.startDate ?? '2026-10-05',
        JSON.stringify({ name: 'Plan sintético', monthlyPrice: input.monthlyPrice ?? '100.00' }),
        JSON.stringify({
          treatment: 'STANDARD',
          legalBasis: 'ET-468',
          ratePercent: 19,
          requiresAccountantReview: false,
          resolvedAt: '2026-10-01T00:00:00.000Z',
        }),
        encryptedFiscalDocument,
      ],
    );
    return { id, subscriberId };
  }

  async function createDraft(contractId: string, date = localDateInBogota()): Promise<string> {
    const summary = await inTenant(() => generation.generate({ contractId, date, actorId }));
    expect(summary).toMatchObject({ generated: 1, failed: 0 });
    const [row] = await sql<{ id: string }>(
      `SELECT d.id::text
         FROM billing_documents d
         JOIN billing_periods p ON p.id = d.period_id
        WHERE d.tenant_id = $1 AND d.contract_id = $2 AND d.status = 'BORRADOR'
        ORDER BY p.period_start DESC
        LIMIT 1`,
      [tenantId, contractId],
    );
    if (!row) throw new Error('La generación no persistió el borrador esperado.');
    return row.id;
  }

  async function issue(documentIds: string[]): Promise<void> {
    await inTenant(() => documents.issue(documentIds, actorId));
  }

  async function counts(query: string, values: unknown[] = []): Promise<PersistedCounts> {
    const [row] = await sql<PersistedCounts>(query, values);
    if (!row) throw new Error('La consulta de conteo no devolvió una fila.');
    return row;
  }

  function clearEvents(): void {
    paidEvents.length = 0;
    reopenedEvents.length = 0;
  }

  beforeAll(async () => {
    dataSource = new DataSource({
      ...dataSourceOptions,
      entities: [Tenant],
      migrations: [],
      logging: false,
      extra: { ...dataSourceOptions.extra, max: 10, min: 1, connectionTimeoutMillis: 3_000 },
    });
    await dataSource.initialize();
    billingFixture = await createBillingSchema(dataSource);
    schemaName = billingFixture.schemaName;
    tenantId = billingFixture.tenantId;

    adapter = new BillingContractReadAdapter(dataSource, config, settings as never);
    payments = new BillingPaymentsService(
      dataSource,
      adapter,
      audit as never,
      events,
      privacy,
      settings as unknown as SettingsPriorityTenantReadPort,
    );
    documents = new BillingDocumentsService(
      dataSource,
      audit as never,
      adapter,
      issuer,
      config,
      permissions,
      settings as unknown as SettingsPriorityTenantReadPort,
      privacy,
      payments,
    );
    generation = new BillingGenerationService(
      dataSource,
      adapter,
      settings as unknown as SettingsPriorityTenantReadPort,
      documents,
      audit as never,
      privacy,
    );
    processor = new BillingGenerationProcessor(
      { upsertJobScheduler: jest.fn() } as never,
      new TenantLifecycleReadAdapter(dataSource.getRepository(Tenant)),
      settings as unknown as SettingsPriorityTenantReadPort,
      generation,
    );
    events.on('billing.contract-period.paid', (payload: PeriodEvent['payload']) => {
      paidEvents.push(payload);
    });
    events.on('billing.contract-period.reopened', (payload: PeriodEvent['payload']) => {
      reopenedEvents.push(payload);
    });
  });

  beforeEach(async () => {
    clearEvents();
    jest.clearAllMocks();
    settings.getSnapshot.mockResolvedValue({
      timezone: 'America/Bogota',
      mfaRequiredAll: false,
      brandingCustomized: false,
    });
    privacy.activeMarks = jest.fn().mockResolvedValue({});
    issuer.getIssuerIdentity = jest.fn().mockResolvedValue({
      legalName: 'Operador sintético',
      nit: '900000000',
      verificationDigit: null,
    });
    permissions.getEffectivePermissionsForUser = jest.fn().mockResolvedValue([]);
    await sql(
      `TRUNCATE billing_period_signals, billing_payment_allocations, billing_payments,
         billing_document_lines, billing_documents, billing_periods, billing_contract_policy,
         contracts, subscribers CASCADE`,
    );
    await sql(
      `UPDATE billing_policy
          SET period_timing='VENCIDO', cutoff_mode='VENCIMIENTO_MAS_GRACIA',
              cutoff_enabled=true, payment_term_days=14, grace_days=0,
              first_period_mode='SEPARADO', approval_mode='BORRADOR',
              automatic_generation=false, auto_apply_credit=true, proration_method='DIAS_REALES'
        WHERE tenant_id=$1`,
      [tenantId],
    );
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dropBillingTenantFixture(dataSource, billingFixture);
  });

  it(
    'CA-FAC-06: diez pagos concurrentes con la misma clave persisten un pago y una tanda; el cuerpo distinto da 409',
    async () => {
      const subscriber = await createSubscriber();
      const contract = await createContract(subscriber.id);
      const draft = await createDraft(contract.id);
      await issue([draft]);
      const [document] = await sql<{ id: string; total: string }>(
        `SELECT id::text, total::text FROM billing_documents WHERE id=$1`,
        [draft],
      );
      if (!document) throw new Error('No se encontró el documento emitido.');
      const body = {
        subscriberId: subscriber.id,
        amount: document.total,
        method: 'TRANSFERENCIA' as const,
        paidAt: localDateInBogota(),
        allocations: [{ documentId: document.id, amount: document.total }],
      };

      const responses = await inTenant(() =>
        Promise.all(
          Array.from({ length: 10 }, () =>
            payments.registerPayment(body, 'g3-ca-fac-06-same-key', actorId),
          ),
        ),
      );
      expect(new Set(responses.map(({ id }) => id)).size).toBe(1);
      expect(responses).toHaveLength(10);
      expect(
        await counts(
          `SELECT count(*)::int AS total, count(*) FILTER (WHERE status='REGISTRADO')::int AS active,
                  sum(amount)::numeric(14,2)::text AS amount FROM billing_payments`,
        ),
      ).toEqual({ total: 1, active: 1, amount: document.total });
      expect(
        await counts(
          `SELECT count(*)::int AS total,
                  count(*) FILTER (WHERE reversed_at IS NULL)::int AS active,
                  sum(amount)::numeric(14,2)::text AS amount
             FROM billing_payment_allocations`,
        ),
      ).toEqual({ total: 1, active: 1, amount: document.total });
      expect(paidEvents).toHaveLength(1);
      expect(await sql('SELECT paid FROM billing_period_signals')).toEqual([{ paid: true }]);

      await expect(
        inTenant(() =>
          payments.registerPayment({ ...body, amount: '120.00' }, 'g3-ca-fac-06-same-key', actorId),
        ),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: 'IDEMPOTENCY_KEY_REUSED' },
      });
      expect(
        await counts(
          `SELECT count(*)::int AS total,
                  count(*) FILTER (WHERE status='REGISTRADO')::int AS active,
                  sum(amount)::numeric(14,2)::text AS amount
             FROM billing_payments`,
        ),
      ).toEqual({
        total: 1,
        active: 1,
        amount: document.total,
      });
      expect(
        await counts(
          `SELECT count(*)::int AS total,
                  count(*) FILTER (WHERE reversed_at IS NULL)::int AS active,
                  sum(amount)::numeric(14,2)::text AS amount
             FROM billing_payment_allocations`,
        ),
      ).toEqual({
        total: 1,
        active: 1,
        amount: document.total,
      });
    },
    describeWithTimeout,
  );

  it(
    'CA-FAC-07: la anulación iniciada durante la publicación del pago deja señal y eventos únicos coherentes',
    async () => {
      const subscriber = await createSubscriber();
      const contract = await createContract(subscriber.id);
      const draft = await createDraft(contract.id);
      await issue([draft]);
      const [document] = await sql<{ id: string; total: string }>(
        'SELECT id::text, total::text FROM billing_documents WHERE id=$1',
        [draft],
      );
      if (!document) throw new Error('No se encontró el documento emitido.');
      const body = {
        subscriberId: subscriber.id,
        amount: document.total,
        method: 'TRANSFERENCIA' as const,
        paidAt: localDateInBogota(),
        allocations: [{ documentId: document.id, amount: document.total }],
      };
      let voidedPaymentId: string | undefined;
      events.once('billing.contract-period.paid', async () => {
        const [payment] = await sql<{ id: string }>(
          'SELECT id::text FROM billing_payments WHERE idempotency_key=$1',
          ['g3-ca-fac-07-payment'],
        );
        if (!payment) throw new Error('El pago no quedó visible tras su commit.');
        voidedPaymentId = payment.id;
        await inTenant(() =>
          payments.voidPayment(payment.id, { reasonCode: 'ERROR_DE_REGISTRO' }, actorId),
        );
      });

      await inTenant(() => payments.registerPayment(body, 'g3-ca-fac-07-payment', actorId));
      expect(voidedPaymentId).toBeDefined();
      expect(
        await sql<{ status: string; total: number }>(
          `SELECT status, count(*) OVER ()::int AS total
             FROM billing_payments WHERE id=$1`,
          [voidedPaymentId],
        ),
      ).toEqual([{ status: 'ANULADO', total: 1 }]);
      expect(
        await counts(
          `SELECT count(*)::int AS total,
                  count(*) FILTER (WHERE reversed_at IS NULL)::int AS active,
                  sum(amount)::numeric(14,2)::text AS amount
             FROM billing_payment_allocations WHERE payment_id=$1`,
          [voidedPaymentId],
        ),
      ).toEqual({ total: 1, active: 0, amount: document.total });
      expect(await sql('SELECT paid FROM billing_period_signals')).toEqual([{ paid: false }]);
      expect(paidEvents).toHaveLength(1);
      expect(reopenedEvents).toHaveLength(1);
    },
    describeWithTimeout,
  );

  it(
    'anular el documento mientras entra un pago no deja aplicaciones vigentes sobre ANULADO',
    async () => {
      const subscriber = await createSubscriber();
      const contract = await createContract(subscriber.id);
      const draft = await createDraft(contract.id);
      await issue([draft]);
      const [document] = await sql<{ id: string; total: string }>(
        'SELECT id::text, total::text FROM billing_documents WHERE id=$1',
        [draft],
      );
      if (!document) throw new Error('No se encontró el documento emitido.');
      const [paymentAttempt, voidAttempt] = await Promise.allSettled([
        inTenant(() =>
          payments.registerPayment(
            {
              subscriberId: subscriber.id,
              amount: document.total,
              method: 'TRANSFERENCIA',
              paidAt: localDateInBogota(),
              allocations: [{ documentId: document.id, amount: document.total }],
            },
            'g3-document-void-payment-race',
            actorId,
          ),
        ),
        inTenant(() => documents.void(document.id, 'ERROR_DE_VALOR', undefined, actorId)),
      ]);
      expect(voidAttempt.status).toBe('fulfilled');
      if (paymentAttempt.status === 'rejected') {
        expect(paymentAttempt.reason).toMatchObject({
          status: 409,
          response: { code: 'BILLING_DOCUMENT_NOT_ISSUED' },
        });
      }
      const [persistedDocument] = await sql<{ status: string; period_id: string }>(
        'SELECT status, period_id::text FROM billing_documents WHERE id=$1',
        [document.id],
      );
      expect(persistedDocument?.status).toBe('ANULADO');
      const allocationCounts = await counts(
        `SELECT count(*)::int AS total,
                  count(*) FILTER (WHERE reversed_at IS NULL)::int AS active,
                  sum(amount)::numeric(14,2)::text AS amount
             FROM billing_payment_allocations WHERE document_id=$1`,
        [document.id],
      );
      expect(allocationCounts.active).toBe(0);
      expect(allocationCounts.total).toBeLessThanOrEqual(1);
      expect([null, document.total]).toContain(allocationCounts.amount);
      expect(
        await sql<{ paid: boolean }>('SELECT paid FROM billing_period_signals WHERE period_id=$1', [
          persistedDocument?.period_id,
        ]),
      ).toEqual([{ paid: false }]);
      expect(paidEvents.length).toBeLessThanOrEqual(1);
      expect(reopenedEvents.length).toBeLessThanOrEqual(1);
    },
    describeWithTimeout,
  );

  it(
    'CA-FAC-08: dos emisiones simultáneas comparten el crédito sin exceder el remanente (RS-17)',
    async () => {
      const subscriber = await createSubscriber();
      const contracts = [await createContract(subscriber.id), await createContract(subscriber.id)];
      await sql("UPDATE billing_policy SET approval_mode='AUTOMATICA' WHERE tenant_id=$1", [
        tenantId,
      ]);
      const credit = await inTenant(() =>
        payments.registerPayment(
          {
            subscriberId: subscriber.id,
            amount: '119.00',
            method: 'TRANSFERENCIA',
            paidAt: localDateInBogota(),
          },
          'g3-ca-fac-08-credit',
          actorId,
        ),
      );
      expect(credit.unallocatedAmount).toBe('119.00');
      const summaries = await inTenant(() =>
        Promise.all(
          contracts.map(({ id }) =>
            generation.generate({ contractId: id, date: localDateInBogota(), actorId: null }),
          ),
        ),
      );
      expect(summaries.map(({ generated, failed }) => ({ generated, failed }))).toEqual([
        { generated: 1, failed: 0 },
        { generated: 1, failed: 0 },
      ]);
      expect(
        await counts(
          `SELECT count(*)::int AS total,
                  count(*) FILTER (WHERE status='EMITIDO')::int AS active,
                  sum(total)::numeric(14,2)::text AS amount
             FROM billing_documents`,
        ),
      ).toEqual({ total: 2, active: 2, amount: '238.00' });
      const allocationCounts = await counts(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE reversed_at IS NULL)::int AS active,
                sum(amount)::numeric(14,2)::text AS amount
           FROM billing_payment_allocations WHERE payment_id=$1`,
        [credit.id],
      );
      expect(allocationCounts).toEqual({ total: 1, active: 1, amount: '119.00' });
      expect(
        await sql<{ created_by: string | null; total: string }>(
          `SELECT created_by::text, amount::text AS total
             FROM billing_payment_allocations WHERE payment_id=$1`,
          [credit.id],
        ),
      ).toEqual([{ created_by: null, total: '119.00' }]);
      expect(
        await counts(
          `SELECT count(*)::int AS total,
                  count(*) FILTER (WHERE paid)::int AS active,
                  sum(CASE WHEN paid THEN 1 ELSE 0 END)::numeric(14,2)::text AS amount
             FROM billing_period_signals`,
        ),
      ).toEqual({ total: 1, active: 1, amount: '1.00' });
      expect(paidEvents).toHaveLength(1);
      expect(reopenedEvents).toHaveLength(0);
    },
    describeWithTimeout,
  );

  it(
    'dos lotes de emisión solapados en orden inverso no bloquean ni dejan huecos en el consecutivo',
    async () => {
      const subscribers = [await createSubscriber(), await createSubscriber()];
      const contracts = await Promise.all(subscribers.map(({ id }) => createContract(id)));
      const drafts = await Promise.all(contracts.map(({ id }) => createDraft(id)));
      const results = await Promise.allSettled([issue(drafts), issue([...drafts].reverse())]);
      const fulfilled = results.filter((result) => result.status === 'fulfilled');
      const rejected = results.filter((result) => result.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]).toMatchObject({
        status: 'rejected',
        reason: { status: 409, response: { code: 'BILLING_DOCUMENT_NOT_DRAFT' } },
      });
      expect(
        await sql<{ number: string; status: string }>(
          'SELECT number, status FROM billing_documents ORDER BY number',
        ),
      ).toEqual([
        { number: 'DC-000001', status: 'EMITIDO' },
        { number: 'DC-000002', status: 'EMITIDO' },
      ]);
      expect(
        await counts(
          `SELECT count(*)::int AS total,
                  count(*) FILTER (WHERE status='EMITIDO')::int AS active,
                  count(DISTINCT number)::numeric(14,2)::text AS amount
             FROM billing_documents`,
        ),
      ).toEqual({ total: 2, active: 2, amount: '2.00' });
    },
    describeWithTimeout,
  );

  it(
    'CA-FAC-03: job y generación manual simultáneos persisten un periodo y un documento',
    async () => {
      const subscriber = await createSubscriber();
      const contract = await createContract(subscriber.id);
      await sql("UPDATE public.tenants SET status='ACTIVE' WHERE id=$1", [tenantId]);
      await sql('UPDATE billing_policy SET automatic_generation=true WHERE tenant_id=$1', [
        tenantId,
      ]);
      const localDate = localDateInBogota();
      const job = {
        name: BILLING_GENERATION_JOB,
        data: { tenantId, schemaName, localDate },
      } as unknown as Job<unknown>;

      const [manual] = await Promise.all([
        inTenant(() => generation.generate({ contractId: contract.id, date: localDate, actorId })),
        processor.process(job),
      ]);
      expect(manual.failed).toBe(0);
      expect(manual.generated + manual.existing).toBe(1);
      expect(await generation.automaticGenerationEnabled(tenantId, schemaName)).toBe(true);
      expect(
        await counts(
          `SELECT count(*)::int AS total,
                  count(*) FILTER (WHERE status='BORRADOR')::int AS active,
                  sum(CASE WHEN status='BORRADOR' THEN 1 ELSE 0 END)::numeric(14,2)::text AS amount
             FROM billing_documents WHERE contract_id=$1`,
          [contract.id],
        ),
      ).toEqual({ total: 1, active: 1, amount: '1.00' });
      expect(
        await counts(
          `SELECT count(*)::int AS total,
                  count(DISTINCT period_start)::int AS active,
                  count(DISTINCT period_start)::numeric(14,2)::text AS amount
             FROM billing_periods WHERE contract_id=$1`,
          [contract.id],
        ),
      ).toEqual({ total: 1, active: 1, amount: '1.00' });
    },
    describeWithTimeout,
  );
});
