import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { dataSourceOptions, runInTenantSchema, TenantContext } from '@iwana/db';
import {
  suggestFifoAllocations as suggestShared,
  BILLING_BLOCKED_BUYER_DISPLAY_NAME,
} from '@iwana/shared';
import { billingPostgresIntegrationEnabled } from '../../../../../packages/database/src/migrations/tenant/billing-migration.integration-helpers';
import { createFiscalDocumentCrypto } from '../../common/crypto/fiscal-document.util';
import { BillingContractReadAdapter } from '../crm/contracts/billing-contract-read.adapter';
import { createBillingSchema } from './billing-postgres.fixture';
import { BillingDocumentsService } from './documents/billing-documents.service';
import { renderBillingDocumentPdf } from './documents/billing-documents.pdf';
import { BillingGenerationService } from './generation/billing-generation.service';
import { BillingPaymentsService } from './payments/billing-payments.service';
import { suggestFifoAllocations as suggestApi } from './payments/allocation';

const describeDb = billingPostgresIntegrationEnabled ? describe : describe.skip;
describeDb('BR-6 contratos que F2 necesita (RS-21 y RS-22)', () => {
  let ds: DataSource;
  let schemaName: string;
  let tenantId: string;
  let generation: BillingGenerationService;
  let documents: BillingDocumentsService;
  let payments: BillingPaymentsService;
  let adapter: BillingContractReadAdapter;
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
  const config = new ConfigService({
    PII_ENCRYPTION_KEY: '12'.repeat(32),
    MFA_ENCRYPTION_KEY: '12'.repeat(32),
    PII_HASH_KEY: '34'.repeat(32),
    NODE_ENV: 'test',
  });
  const fiscalCrypto = createFiscalDocumentCrypto(config);
  const context = () => ({ tenantId, schemaName, tenantSlug: 'br6-fixture' });
  const run = <T>(fn: () => Promise<T>) => TenantContext.run(context(), fn);
  const sql = <T = Record<string, unknown>>(query: string, args: unknown[] = []) =>
    runInTenantSchema(ds, schemaName, (qr) => qr.query(query, args) as Promise<T[]>);

  async function seed(
    input: {
      businessName?: string;
      anonymized?: boolean;
      cycle?: number | null;
      status?: string;
      statusReason?: string | null;
    } = {},
  ) {
    const id = randomUUID();
    const subscriber = randomUUID();
    const party = randomUUID();
    await sql(
      `INSERT INTO subscribers (id,tenant_id,party_id,person_type,document_type,business_name,anonymized_at,anonymized_request_id) VALUES ($1,$2,$3,'JURIDICA','NIT',$4,$5,$6)`,
      [
        subscriber,
        tenantId,
        party,
        input.businessName ?? 'Titular sintético',
        input.anonymized ? new Date().toISOString() : null,
        input.anonymized ? randomUUID() : null,
      ],
    );
    await sql(
      `INSERT INTO contracts (id,tenant_id,subscriber_id,status,status_reason_code,billing_cycle_day,start_date,plan_snapshot_json,vat_snapshot,fiscal_document_encrypted,additional_product_ids,additional_service_ids)
       VALUES ($1,$2,$3,$4,$5,$6,'2026-10-05',$7::jsonb,$8::jsonb,$9,'[]'::jsonb,'[]'::jsonb)`,
      [
        id,
        tenantId,
        subscriber,
        input.status ?? 'ACTIVE',
        input.statusReason ?? null,
        input.cycle === undefined ? 5 : input.cycle,
        JSON.stringify({ name: 'Plan sintético', monthlyPrice: '100.00' }),
        JSON.stringify({
          treatment: 'STANDARD',
          legalBasis: 'ET-468',
          ratePercent: 19,
          requiresAccountantReview: false,
          resolvedAt: '2026-10-01T00:00:00Z',
        }),
        fiscalCrypto.encrypt('900000001')?.encrypted ?? null,
      ],
    );
    return { id, subscriber, party };
  }

  async function draft(contractId: string, date = '2026-11-05') {
    await run(() => generation.generate({ contractId, date, actorId }));
    const [row] = await sql<{ id: string }>(
      `SELECT d.id FROM billing_documents d JOIN billing_periods p ON p.id=d.period_id
        WHERE d.contract_id=$1 AND d.status='BORRADOR' ORDER BY p.period_start DESC LIMIT 1`,
      [contractId],
    );
    if (!row) throw new Error('No se creó el borrador de fixture');
    return row.id;
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
    const f = await createBillingSchema(ds);
    schemaName = f.schemaName;
    tenantId = f.tenantId;
    adapter = new BillingContractReadAdapter(ds, config, settings as never);
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
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    privacy.activeMarks.mockResolvedValue({});
    permissions.getEffectivePermissionsForUser.mockResolvedValue([]);
    await sql(
      'TRUNCATE billing_period_signals,billing_payment_allocations,billing_payments,billing_documents,billing_periods,billing_contract_policy,contracts,subscribers CASCADE',
    );
  });

  afterAll(async () => {
    if (ds?.isInitialized) {
      await ds.query(`DROP SCHEMA "${schemaName}" CASCADE`);
      await ds.query('DELETE FROM public.tenants WHERE id=$1', [tenantId]);
      await ds.destroy();
    }
  });

  it('RS-21 listas con permiso entregan el dato con un solo LIST_ACCESS auditado', async () => {
    const a = await seed({ businessName: 'Bloqueado Uno' });
    const b = await seed({ businessName: 'Bloqueado Dos' });
    const draftA = await draft(a.id);
    const draftB = await draft(b.id);
    await run(() => documents.issue([draftA, draftB], actorId));
    privacy.activeMarks.mockResolvedValue({
      [a.party]: ['DATOS_BLOQUEADOS'],
      [b.party]: ['DATOS_BLOQUEADOS'],
    });
    permissions.getEffectivePermissionsForUser.mockResolvedValue(['crm.blocked_data.read']);

    const result = await run(() => documents.list({ page: 1, limit: 25 }, actorId));

    expect(result.data).toHaveLength(2);
    const listAccessCalls = audit.logWithin.mock.calls.filter(
      ([entry]) => (entry as { action?: string }).action === 'LIST_ACCESS',
    );
    expect(listAccessCalls).toHaveLength(1);
    expect(audit.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'LIST_ACCESS',
        entityId: 'N/A',
        newValue: expect.objectContaining({ blockedServed: 2, totalServed: 2 }),
      }),
      expect.anything(),
    );
    for (const item of result.data) {
      expect(item.buyerProtected).toBe(false);
      expect(item.buyerSnapshot?.displayName).not.toBe(BILLING_BLOCKED_BUYER_DISPLAY_NAME);
    }
  });

  it('RS-21 sin permiso oculta al adquirente con buyerProtected y texto legal, y el PDF no dice Titular', async () => {
    const c = await seed({ businessName: 'Nombre Real Protegido' });
    const draftId = await draft(c.id);
    await run(() => documents.issue([draftId], actorId));
    privacy.activeMarks.mockResolvedValue({ [c.party]: ['DATOS_BLOQUEADOS'] });

    const detail = await run(() => documents.findOne(draftId, actorId));
    expect(detail.buyerProtected).toBe(true);
    expect(detail.buyerSnapshot?.displayName).toBe(BILLING_BLOCKED_BUYER_DISPLAY_NAME);

    const contents: string[] = [];
    const { default: PDFDocument } = await import('pdfkit');
    const spy = jest.spyOn(PDFDocument.prototype, 'text').mockImplementation(function (
      this: unknown,
      text: unknown,
    ) {
      contents.push(String(text));
      return this as never;
    });
    await renderBillingDocumentPdf(detail as never);
    spy.mockRestore();
    expect(contents.join('\n')).toContain(BILLING_BLOCKED_BUYER_DISPLAY_NAME);
  });

  it('RS-21 si la auditoría falla la lectura responde 503 sin entregar el dato', async () => {
    const c = await seed({ businessName: 'Auditoría Caída' });
    const draftId = await draft(c.id);
    await run(() => documents.issue([draftId], actorId));
    privacy.activeMarks.mockResolvedValue({ [c.party]: ['DATOS_BLOQUEADOS'] });
    permissions.getEffectivePermissionsForUser.mockResolvedValue(['privacy.read']);
    audit.logWithin.mockRejectedValueOnce(new Error('auditoría caída'));

    await expect(run(() => documents.findOne(draftId, actorId))).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PRIVACY_AUDIT_UNAVAILABLE' }),
    });
  });

  it('RS-22 el documento trae periodo, cobertura y estado; y el estado de cuenta también', async () => {
    const c = await seed();
    const draftId = await draft(c.id);
    await run(() => documents.issue([draftId], actorId));

    const detail = await run(() => documents.findOne(draftId, actorId));
    expect(detail.periodStart).toBe('2026-11-05');
    expect(detail.periodEnd).toBe('2026-12-04');
    expect(detail.coveredStart).toBe('2026-11-05');
    expect(detail.paymentState).toBe('PENDIENTE');
    expect(detail.buyerProtected).toBe(false);

    await run(() =>
      payments.registerPayment(
        {
          subscriberId: c.subscriber,
          amount: '119.00',
          method: 'TRANSFERENCIA',
          paidAt: '2026-11-06',
        },
        'br6-estado-pagado',
        actorId,
      ),
    );
    const paid = await run(() => documents.findOne(draftId, actorId));
    expect(paid.paymentState).toBe('PAGADO');

    const statement = await run(() => payments.statementForSubscriber(c.subscriber));
    expect(statement.buyerProtected).toBe(false);
    expect(statement.documents[0]?.periodStart).toBe('2026-11-05');
    expect(statement.documents[0]?.coveredStart).toBe('2026-11-05');
    expect(statement.documents[0]?.paymentState).toBe('PAGADO');
    expect(statement.documents[0]?.buyerProtected).toBe(false);
  });

  it('RS-22 filtra por paymentState y cycleDay en SQL con paginación correcta', async () => {
    const cycle5 = await seed({ cycle: 5 });
    const cycle15 = await seed({ cycle: 15 });
    const draft5 = await draft(cycle5.id);
    const draft15 = await draft(cycle15.id, '2026-11-15');
    await run(() => documents.issue([draft5, draft15], actorId));
    await run(() =>
      payments.registerPayment(
        {
          subscriberId: cycle5.subscriber,
          amount: '119.00',
          method: 'TRANSFERENCIA',
          paidAt: '2026-11-06',
        },
        'br6-filtro-pagado',
        actorId,
      ),
    );

    const paid = await run(() =>
      documents.list({ page: 1, limit: 25, paymentState: 'PAGADO' }, actorId),
    );
    expect(paid.total).toBe(1);
    expect(paid.data[0]?.contractId).toBe(cycle5.id);

    const cycle = await run(() => documents.list({ page: 1, limit: 25, cycleDay: 15 }, actorId));
    expect(cycle.total).toBe(1);
    expect(cycle.data[0]?.contractId).toBe(cycle15.id);

    const pendingCycle = await run(() =>
      documents.list({ page: 1, limit: 25, paymentState: 'PENDIENTE', cycleDay: 15 }, actorId),
    );
    expect(pendingCycle.total).toBe(1);
  });

  it('RS-22 la agenda devuelve importes por contrato y nulos en SIN_DOCUMENTO', async () => {
    const paid = await seed();
    const idle = await seed();
    const draftId = await draft(paid.id);
    await run(() => documents.issue([draftId], actorId));
    await run(() =>
      payments.registerPayment(
        {
          subscriberId: paid.subscriber,
          amount: '119.00',
          method: 'TRANSFERENCIA',
          paidAt: '2026-11-06',
        },
        'br6-agenda-pagado',
        actorId,
      ),
    );

    const states = await run(() => payments.periodStates([paid.id, idle.id], '2026-11-12'));
    expect(states[paid.id]).toEqual({
      state: 'PAGADO',
      paidAmount: '119.00',
      totalAmount: '119.00',
    });
    expect(states[idle.id]).toEqual({
      state: 'SIN_DOCUMENTO',
      paidAmount: null,
      totalAmount: null,
    });
  });

  it('RS-22 la lista de pagos muestra nombre, protege al bloqueado y nulo al anonimizado', async () => {
    const visible = await seed({ businessName: 'Visible Sintético' });
    const blocked = await seed({ businessName: 'Nombre Real Bloqueado' });
    const anon = await seed({ businessName: 'Nombre Anonimizado', anonymized: true });
    await run(() =>
      payments.registerPayment(
        {
          subscriberId: visible.subscriber,
          amount: '10.00',
          method: 'EFECTIVO',
          paidAt: '2026-11-06',
        },
        'br6-pay-visible',
        actorId,
      ),
    );
    await run(() =>
      payments.registerPayment(
        {
          subscriberId: blocked.subscriber,
          amount: '10.00',
          method: 'EFECTIVO',
          paidAt: '2026-11-06',
        },
        'br6-pay-blocked',
        actorId,
      ),
    );
    // RS-6: un anonimizado no puede pagar por API; se siembra el pago directo para la lista.
    await sql(
      `INSERT INTO billing_payments (tenant_id, subscriber_id, method, amount, paid_at, idempotency_key, created_by)
       VALUES ($1, $2, 'EFECTIVO', 10.00, '2026-11-06', 'br6-pay-anon', $3)`,
      [tenantId, anon.subscriber, actorId],
    );
    privacy.activeMarks.mockResolvedValue({ [blocked.party]: ['DATOS_BLOQUEADOS'] });

    const hidden = await run(() =>
      payments.listPayments({ page: 1, limit: 25 }, { actorId, canSeeBlocked: false }),
    );
    const hiddenBlocked = hidden.data.find((item) => item.subscriberId === blocked.subscriber);
    const hiddenAnon = hidden.data.find((item) => item.subscriberId === anon.subscriber);
    expect(hiddenBlocked?.subscriberProtected).toBe(true);
    expect(hiddenBlocked?.subscriberDisplayName).toBe(BILLING_BLOCKED_BUYER_DISPLAY_NAME);
    expect(hiddenBlocked?.subscriberDisplayName).not.toBe('Nombre Real Bloqueado');
    expect(hiddenAnon?.subscriberDisplayName).toBeNull();
    expect(hiddenAnon?.subscriberProtected).toBe(true);
    const hiddenListAccess = audit.logWithin.mock.calls.filter(
      ([entry]) => (entry as { action?: string }).action === 'LIST_ACCESS',
    );
    expect(hiddenListAccess).toHaveLength(0);

    const shown = await run(() =>
      payments.listPayments(
        { page: 1, limit: 25 },
        { actorId, canSeeBlocked: true, grantedBy: 'CRM_BLOCKED_DATA_READ' },
      ),
    );
    const shownBlocked = shown.data.find((item) => item.subscriberId === blocked.subscriber);
    expect(shownBlocked?.subscriberDisplayName).toBe('Nombre Real Bloqueado');
    const shownListAccess = audit.logWithin.mock.calls.filter(
      ([entry]) => (entry as { action?: string }).action === 'LIST_ACCESS',
    );
    expect(shownListAccess).toHaveLength(1);
    expect(audit.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'LIST_ACCESS', entityId: 'N/A' }),
      expect.anything(),
    );
  });

  it('RS-22 el estado de cuenta señala la alerta de suplantación con la condición de §6.1 paso 2b', async () => {
    const victim = await seed();
    privacy.activeMarks.mockResolvedValue({ [victim.party]: ['VICTIMA_FALSEDAD_PERSONAL'] });
    const heldByMark = await run(() => payments.statementForSubscriber(victim.subscriber));
    expect(heldByMark.impersonationHold).toBe(true);

    privacy.activeMarks.mockResolvedValue({});
    const suspended = await seed({ status: 'SUSPENDED', statusReason: 'SUPLANTACION' });
    const heldByContract = await run(() => payments.statementForSubscriber(suspended.subscriber));
    expect(heldByContract.impersonationHold).toBe(true);

    const clean = await seed();
    const released = await run(() => payments.statementForSubscriber(clean.subscriber));
    expect(released.impersonationHold).toBe(false);
  });

  it('RS-22 el FIFO vive en @iwana/shared y la API reparte igual', () => {
    const candidates = [
      {
        documentId: '00000000-0000-4000-8000-000000000002',
        dueDate: '2026-11-30',
        pendingAmount: '80.00',
      },
      {
        documentId: '00000000-0000-4000-8000-000000000001',
        dueDate: '2026-10-30',
        pendingAmount: '100.00',
      },
    ];
    expect(suggestApi('125.00', candidates)).toEqual(suggestShared('125.00', candidates));
    expect(suggestShared('125.00', candidates)).toEqual([
      { documentId: '00000000-0000-4000-8000-000000000001', amount: '100.00' },
      { documentId: '00000000-0000-4000-8000-000000000002', amount: '25.00' },
    ]);
  });
});
