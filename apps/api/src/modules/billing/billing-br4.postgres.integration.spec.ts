import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { dataSourceOptions, runInTenantSchema, TenantContext } from '@iwana/db';
import { billingPostgresIntegrationEnabled } from '../../../../../packages/database/src/migrations/tenant/billing-migration.integration-helpers';
import { createFiscalDocumentCrypto } from '../../common/crypto/fiscal-document.util';
import { BillingContractReadAdapter } from '../crm/contracts/billing-contract-read.adapter';
import { CrmContractStandingReadAdapter } from '../crm/privacy-adapters/crm-contract-standing-read.adapter';
import { createBillingSchema } from './billing-postgres.fixture';
import { BillingDocumentsService } from './documents/billing-documents.service';
import { BillingGenerationService } from './generation/billing-generation.service';
import { BillingPaymentsService } from './payments/billing-payments.service';
import { BillingPolicyService } from './policy/billing-policy.service';

type Timing = 'ANTICIPADO' | 'VENCIDO';
type Mode = 'DIA_FIJO_CICLO' | 'VENCIMIENTO_MAS_GRACIA';

const describeDb = billingPostgresIntegrationEnabled ? describe : describe.skip;
describeDb('BR-4 hallazgos de los revisores de G3 sobre migración 173 real', () => {
  let ds: DataSource;
  let schemaName: string;
  let tenantId: string;
  let generation: BillingGenerationService;
  let documents: BillingDocumentsService;
  let payments: BillingPaymentsService;
  let policies: BillingPolicyService;
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
  const context = () => ({ tenantId, schemaName, tenantSlug: 'br4-fixture' });
  const run = <T>(fn: () => Promise<T>) => TenantContext.run(context(), fn);
  const sql = <T = Record<string, unknown>>(query: string, args: unknown[] = []) =>
    runInTenantSchema(ds, schemaName, (qr) => qr.query(query, args) as Promise<T[]>);

  async function seed(
    input: {
      start?: string;
      document?: string | null;
      encrypted?: boolean;
      cycle?: number | null;
      partyId?: string;
      tenant?: string;
      status?: string;
      terminated?: string;
    } = {},
  ) {
    const id = randomUUID();
    const subscriber = randomUUID();
    const party = input.partyId ?? randomUUID();
    const owner = input.tenant ?? tenantId;
    const document = input.document === undefined ? '900000001' : input.document;
    await sql(
      `INSERT INTO subscribers (id,tenant_id,party_id,person_type,document_type,business_name) VALUES ($1,$2,$3,'JURIDICA','NIT','Titular sintético')`,
      [subscriber, owner, party],
    );
    await sql(
      `INSERT INTO contracts (id,tenant_id,subscriber_id,status,terminated_at,billing_cycle_day,start_date,plan_snapshot_json,vat_snapshot,fiscal_document,fiscal_document_encrypted)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11)`,
      [
        id,
        owner,
        subscriber,
        input.status ?? 'ACTIVE',
        input.terminated ?? null,
        input.cycle === undefined ? 5 : input.cycle,
        input.start ?? '2026-10-05',
        JSON.stringify({ name: 'Plan sintético', monthlyPrice: '100.00' }),
        JSON.stringify({
          treatment: 'STANDARD',
          legalBasis: 'ET-468',
          ratePercent: 19,
          requiresAccountantReview: false,
          resolvedAt: '2026-10-01T00:00:00Z',
        }),
        document !== null && !input.encrypted ? document : null,
        document !== null && input.encrypted ? fiscalCrypto.encrypt(document)?.encrypted : null,
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
  const pay = (subscriberId: string, amount: string, key: string) =>
    run(() =>
      payments.registerPayment(
        { subscriberId, amount, method: 'TRANSFERENCIA', paidAt: '2026-11-05' },
        key,
        actorId,
      ),
    );

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
    policies = new BillingPolicyService(ds, audit as never, adapter, settings as never);
  });
  beforeEach(async () => {
    jest.clearAllMocks();
    privacy.activeMarks.mockResolvedValue({});
    permissions.getEffectivePermissionsForUser.mockResolvedValue([]);
    issuer.getIssuerIdentity.mockResolvedValue({
      legalName: 'Operador sintético',
      nit: '900000000',
      verificationDigit: null,
    });
    await sql(
      'TRUNCATE billing_period_signals,billing_payment_allocations,billing_payments,billing_documents,billing_periods,billing_contract_policy,contracts,subscribers CASCADE',
    );
    await sql('UPDATE crm_billing_cycles SET active = true');
    await sql(
      `UPDATE billing_policy SET period_timing='VENCIDO',cutoff_mode='VENCIMIENTO_MAS_GRACIA',cutoff_enabled=true,payment_term_days=14,grace_days=0,first_period_mode='SEPARADO',approval_mode='BORRADOR',auto_apply_credit=true,proration_method='DIAS_REALES'`,
    );
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  afterAll(async () => {
    if (ds?.isInitialized) {
      await ds.query(`DROP SCHEMA "${schemaName}" CASCADE`);
      await ds.query('DELETE FROM public.tenants WHERE id=$1', [tenantId]);
      await ds.destroy();
    }
  });

  describe('BR-4.1 (RS-19) estado de la agenda sin forzar cutoff_date', () => {
    const modes: Array<[string, Timing, Mode, boolean]> = [
      ['VENCIMIENTO_MAS_GRACIA con cobro vencido', 'VENCIDO', 'VENCIMIENTO_MAS_GRACIA', true],
      ['VENCIMIENTO_MAS_GRACIA con cobro anticipado', 'ANTICIPADO', 'VENCIMIENTO_MAS_GRACIA', true],
      ['DIA_FIJO_CICLO con corte activo', 'ANTICIPADO', 'DIA_FIJO_CICLO', true],
      ['DIA_FIJO_CICLO con corte apagado', 'ANTICIPADO', 'DIA_FIJO_CICLO', false],
      ['VENCIMIENTO_MAS_GRACIA con corte apagado', 'VENCIDO', 'VENCIMIENTO_MAS_GRACIA', false],
    ];
    it.each(modes)('%s devuelve los cinco estados', async (_name, timing, mode, cutoff) => {
      await sql('UPDATE billing_policy SET period_timing=$1,cutoff_mode=$2,cutoff_enabled=$3', [
        timing,
        mode,
        cutoff,
      ]);
      const contracts: string[] = [];
      const subscribers: string[] = [];
      const drafts: string[] = [];
      for (let i = 0; i < 5; i++) {
        const c = await seed();
        contracts.push(c.id);
        subscribers.push(c.subscriber);
        drafts.push(await draft(c.id));
      }
      await run(() => documents.issue(drafts.slice(1), actorId));
      // Solo se mueve el vencimiento: la fecha de corte la produce la propia generación.
      await sql("UPDATE billing_periods SET due_date='2026-11-25'");
      await sql("UPDATE billing_periods SET due_date='2026-11-01' WHERE contract_id=$1", [
        contracts[2],
      ]);
      await pay(subscribers[1]!, '119.00', `br4-1-${mode}-${cutoff}-1`);
      await pay(subscribers[3]!, '20.00', `br4-1-${mode}-${cutoff}-3`);
      const cutoffs = await sql<{ cutoff_date: string | null }>(
        'SELECT cutoff_date::text FROM billing_periods',
      );
      expect(
        cutoffs.every(({ cutoff_date }) => (cutoff ? cutoff_date !== null : cutoff_date === null)),
      ).toBe(true);
      expect(
        Object.fromEntries(
          Object.entries(await run(() => payments.periodStates(contracts, '2026-11-12'))).map(
            ([id, period]) => [id, period.state],
          ),
        ),
      ).toEqual(
        Object.fromEntries(
          contracts.map((id, i) => [
            id,
            ['SIN_DOCUMENTO', 'PAGADO', 'VENCIDO', 'PARCIAL', 'PENDIENTE'][i],
          ]),
        ),
      );
    });

    it('un contrato pagado con corte por vencimiento más gracia no sale SIN_DOCUMENTO', async () => {
      const c = await seed();
      const id = await draft(c.id);
      await run(() => documents.issue([id], actorId));
      await pay(c.subscriber, '119.00', 'br4-1-paid');
      expect((await run(() => payments.periodStates([c.id], '2026-11-12')))[c.id]?.state).toBe(
        'PAGADO',
      );
    });

    it('toma el periodo más reciente con generation_date <= fecha y trata un contrato sin periodo como SIN_DOCUMENTO', async () => {
      const c = await seed();
      const idle = await seed();
      const first = await draft(c.id, '2026-11-05');
      await run(() => documents.issue([first], actorId));
      await pay(c.subscriber, '119.00', 'br4-1-two-periods');
      await draft(c.id, '2026-12-05');
      const states = await run(() => payments.periodStates([c.id, idle.id], '2026-11-20'));
      expect(states[c.id]?.state).toBe('PAGADO');
      expect(states[idle.id]?.state).toBe('SIN_DOCUMENTO');
      expect(states[c.id]?.paidAmount).toBe('119.00');
      expect(states[c.id]?.totalAmount).toBe('119.00');
      expect(states[idle.id]?.paidAmount).toBeNull();
      expect(states[idle.id]?.totalAmount).toBeNull();
      // El periodo siguiente solo tiene borrador: ADR-103 D3 lo cuenta como SIN_DOCUMENTO.
      const next = await run(() => payments.periodStates([c.id], '2026-12-10'));
      expect(next[c.id]?.state).toBe('SIN_DOCUMENTO');
      expect(next[c.id]?.paidAmount).toBeNull();
      expect(next[c.id]?.totalAmount).toBeNull();
    });
  });

  describe('BR-4.3 (RS-20) ciclo inactivo y contrato sin ciclo', () => {
    it('un contrato con ciclo inactivo se factura con el catálogo completo', async () => {
      await sql('UPDATE crm_billing_cycles SET active = false WHERE cycle_day = 5');
      const c = await seed();
      expect(await run(() => adapter.findBillingCycleByContractId(c.id))).toEqual({
        cycleDay: 5,
        cutoffDay: 20,
      });
      expect(await run(() => adapter.findByContractId(c.id))).toMatchObject({
        cycleDay: 5,
        cutoffDay: 20,
      });
      expect(await run(() => generation.generate({ date: '2026-11-05' }))).toMatchObject({
        generated: 1,
        blocked: 0,
        withoutCycle: 0,
      });
      expect(await sql('SELECT id FROM billing_documents')).toHaveLength(1);
    });

    it('un contrato sin ciclo cuenta como withoutCycle, no como blocked, y no crea periodo ni documento', async () => {
      await seed({ cycle: null });
      await seed();
      expect(await run(() => generation.generate({ date: '2026-11-05' }))).toMatchObject({
        generated: 1,
        blocked: 0,
        withoutCycle: 1,
        failed: 0,
      });
      expect(await sql('SELECT id FROM billing_periods')).toHaveLength(1);
      expect(await sql('SELECT id FROM billing_documents')).toHaveLength(1);
    });
  });

  describe('BR-4.4 descifrado del documento fiscal', () => {
    it('un borrador no descifra ningún documento y SIN_DATOS_FISCALES no lo necesita', async () => {
      for (let i = 0; i < 3; i++) await seed({ encrypted: true });
      await seed({ document: null });
      const decrypt = jest.spyOn(
        (adapter as unknown as { fiscalDocumentCrypto: { decrypt: (v: string) => string } })
          .fiscalDocumentCrypto,
        'decrypt',
      );
      expect(await run(() => generation.generate({ date: '2026-11-05' }))).toMatchObject({
        generated: 3,
        blocked: 1,
      });
      expect(decrypt).not.toHaveBeenCalled();
      expect(
        await sql(
          'SELECT blocking_reason, count(*)::int AS n FROM billing_documents GROUP BY 1 ORDER BY 1',
        ),
      ).toEqual([
        { blocking_reason: 'SIN_DATOS_FISCALES', n: 1 },
        { blocking_reason: null, n: 3 },
      ]);
    });

    it('con aprobación automática descifra solo lo que emite y no repite al día siguiente', async () => {
      await sql("UPDATE billing_policy SET approval_mode='AUTOMATICA'");
      for (let i = 0; i < 3; i++) await seed({ encrypted: true });
      await seed({ document: null });
      const decrypt = jest.spyOn(
        (adapter as unknown as { fiscalDocumentCrypto: { decrypt: (v: string) => string } })
          .fiscalDocumentCrypto,
        'decrypt',
      );
      await run(() => generation.generate({ date: '2026-11-05' }));
      expect(await sql("SELECT id FROM billing_documents WHERE status='EMITIDO'")).toHaveLength(3);
      expect(decrypt).toHaveBeenCalledTimes(3);
      await run(() => generation.generate({ date: '2026-11-05' }));
      expect(decrypt).toHaveBeenCalledTimes(3);
    });

    it('la emisión manual sigue descifrando el documento del adquirente', async () => {
      const c = await seed({ encrypted: true });
      const id = await draft(c.id);
      const decrypt = jest.spyOn(
        (adapter as unknown as { fiscalDocumentCrypto: { decrypt: (v: string) => string } })
          .fiscalDocumentCrypto,
        'decrypt',
      );
      await run(() => documents.issue([id], actorId));
      expect(decrypt).toHaveBeenCalledTimes(1);
      expect((await run(() => documents.findOne(id, actorId))).buyerSnapshot?.documentNumber).toBe(
        '900000001',
      );
    });
  });

  describe('BR-4.7 (ADR-103 D4 regla 1) tenant contra sobrescrituras', () => {
    const update = async (cutoffMode: Mode, periodTiming: Timing) => {
      const current = await run(() => policies.getPolicy());
      return run(() =>
        policies.updatePolicy(
          {
            expectedUpdatedAt: current.updatedAt,
            periodTiming,
            generationLeadDays: current.generationLeadDays,
            cutoffMode,
            paymentTermDays: current.paymentTermDays,
            graceDays: current.graceDays,
            cutoffEnabled: current.cutoffEnabled,
            minimumUnpaidForCutoff: current.minimumUnpaidForCutoff,
            prorationMethod: current.prorationMethod,
            firstPeriodMode: current.firstPeriodMode,
            automaticGeneration: current.automaticGeneration,
            approvalMode: current.approvalMode,
            autoApplyCredit: current.autoApplyCredit,
            generationHour: current.generationHour,
            documentPrefix: current.documentPrefix,
          },
          actorId,
        ),
      );
    };

    it('rechaza DIA_FIJO_CICLO si un contrato sobrescribe VENCIDO, sin PII, y lo admite sin la sobrescritura', async () => {
      await sql(
        "UPDATE billing_policy SET period_timing='ANTICIPADO',cutoff_mode='VENCIMIENTO_MAS_GRACIA'",
      );
      const c = await seed();
      await run(() => policies.updateContractPolicy(c.id, { periodTiming: 'VENCIDO' }, actorId));
      const rejected = await update('DIA_FIJO_CICLO', 'ANTICIPADO').catch(
        (error: unknown) => error,
      );
      expect(rejected).toMatchObject({
        status: 422,
        response: { code: 'BILLING_POLICY_INCOMPATIBLE' },
      });
      expect(JSON.stringify((rejected as { response: unknown }).response)).not.toMatch(
        new RegExp(`${c.id}|${c.subscriber}|Titular`, 'u'),
      );
      expect(await sql('SELECT cutoff_mode FROM billing_policy')).toEqual([
        { cutoff_mode: 'VENCIMIENTO_MAS_GRACIA' },
      ]);
      await run(() => policies.updateContractPolicy(c.id, { periodTiming: null }, actorId));
      await expect(update('DIA_FIJO_CICLO', 'ANTICIPADO')).resolves.toMatchObject({
        cutoffMode: 'DIA_FIJO_CICLO',
      });
    });
  });

  describe('BR-4.8 (RS-18) vencimiento del borrador reutilizado', () => {
    it.each(['discard', 'void'])(
      'la reemisión tras %s conserva el plazo congelado aunque la política cambie',
      async (mode) => {
        const c = await seed();
        const id = await draft(c.id);
        const [first] = await sql<{ due_date: string }>(
          'SELECT due_date::text FROM billing_documents WHERE id=$1',
          [id],
        );
        expect(first?.due_date).toBe('2026-11-19');
        if (mode === 'discard') await run(() => documents.discard(id, actorId));
        else {
          await run(() => documents.issue([id], actorId));
          await run(() => documents.void(id, 'ERROR_DE_VALOR', undefined, actorId));
        }
        await sql('UPDATE billing_policy SET payment_term_days=45,grace_days=7');
        const next = await draft(c.id);
        expect(
          await sql('SELECT due_date::text FROM billing_documents WHERE id=$1', [next]),
        ).toEqual([{ due_date: '2026-11-19' }]);
      },
    );
  });

  describe('BR-4.9 periodState del estado de cuenta', () => {
    it('llena periodState con la misma regla que la agenda', async () => {
      const paid = await seed();
      const pending = await seed();
      const overdue = await seed();
      const ids = [await draft(paid.id), await draft(pending.id), await draft(overdue.id)];
      await run(() => documents.issue(ids, actorId));
      await sql("UPDATE billing_periods SET due_date='2026-11-25'");
      await sql("UPDATE billing_periods SET due_date='2026-11-01' WHERE contract_id=$1", [
        overdue.id,
      ]);
      await pay(paid.subscriber, '119.00', 'br4-9-paid');
      jest.useFakeTimers({
        now: new Date('2026-11-06T17:00:00.000Z'),
        doNotFake: [
          'hrtime',
          'nextTick',
          'performance',
          'queueMicrotask',
          'requestAnimationFrame',
          'cancelAnimationFrame',
          'requestIdleCallback',
          'cancelIdleCallback',
          'setImmediate',
          'clearImmediate',
          'setInterval',
          'clearInterval',
          'setTimeout',
          'clearTimeout',
        ],
      });
      const states: Record<string, string | undefined> = {};
      for (const [name, who] of [
        ['paid', paid],
        ['pending', pending],
        ['overdue', overdue],
      ] as const) {
        const statement = await run(() => payments.statementForSubscriber(who.subscriber));
        states[name] = statement.contractSummaries[0]?.periodState;
        const viaPort = await run(() => payments.periodStates([who.id], '2026-11-06'));
        expect(states[name]).toBe(viaPort[who.id]?.state);
      }
      expect(states).toEqual({ paid: 'PAGADO', pending: 'PENDIENTE', overdue: 'VENCIDO' });
    });
  });

  describe('BR-4.11 pruebas de riesgo', () => {
    it('standing no mezcla a un suscriptor de otro tenant con el mismo party_id', async () => {
      const own = await seed();
      const foreignTenant = randomUUID();
      const foreign = await seed({ partyId: own.party, tenant: foreignTenant });
      await seed({
        partyId: own.party,
        tenant: foreignTenant,
        status: 'TERMINATED',
        terminated: '2026-01-01',
      });
      const standing = await run(() =>
        runInTenantSchema(ds, schemaName, (qr) =>
          new CrmContractStandingReadAdapter().standing(own.party, { manager: qr.manager }),
        ),
      );
      expect(standing.subscriberIds).toEqual([own.subscriber]);
      expect(standing.subscriberIds).not.toContain(foreign.subscriber);
      expect(standing.openContractIds).toEqual([own.id]);
      expect(standing.openContractIds).not.toContain(foreign.id);
      expect(standing.lastTerminatedAt).toBeNull();
    });

    it('anular con motivo SUPLANTACION conserva el motivo, reversa aplicaciones y recalcula la señal', async () => {
      const c = await seed();
      const id = await draft(c.id);
      await run(() => documents.issue([id], actorId));
      await pay(c.subscriber, '119.00', 'br4-11-void');
      await run(() => documents.void(id, 'SUPLANTACION', 'Caso sintético', actorId));
      expect(
        await sql('SELECT status, void_reason_code, voided_by::text FROM billing_documents'),
      ).toEqual([{ status: 'ANULADO', void_reason_code: 'SUPLANTACION', voided_by: actorId }]);
      expect(await sql('SELECT paid FROM billing_period_signals')).toEqual([{ paid: false }]);
      expect(
        await sql(
          'SELECT count(*)::int AS n FROM billing_payment_allocations WHERE reversed_at IS NULL',
        ),
      ).toEqual([{ n: 0 }]);
      expect(audit.logWithin.mock.calls.map(([entry]) => entry.newValue)).toContainEqual(
        expect.objectContaining({ status: 'ANULADO', reasonCode: 'SUPLANTACION' }),
      );
    });
  });
});
