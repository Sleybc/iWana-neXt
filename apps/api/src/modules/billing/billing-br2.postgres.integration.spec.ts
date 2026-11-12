import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { dataSourceOptions, runInTenantSchema, TenantContext } from '@iwana/db';
import { billingPostgresIntegrationEnabled } from '../../../../../packages/database/src/migrations/tenant/billing-migration.integration-helpers';
import { BillingContractReadAdapter } from '../crm/contracts/billing-contract-read.adapter';
import { createBillingSchema } from './billing-postgres.fixture';
import { BillingDocumentsService } from './documents/billing-documents.service';
import { BillingGenerationService } from './generation/billing-generation.service';
import { BillingPaymentsService } from './payments/billing-payments.service';
import { createFiscalDocumentCrypto } from '../../common/crypto/fiscal-document.util';
import { renderBillingDocumentPdf } from './documents/billing-documents.pdf';

const describeDb = billingPostgresIntegrationEnabled ? describe : describe.skip;
describeDb('BR-2 contratos sobre migración 173 real y pool 10', () => {
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
  const emitted: string[] = [];
  const config = new ConfigService({
    PII_ENCRYPTION_KEY: '12'.repeat(32),
    MFA_ENCRYPTION_KEY: '12'.repeat(32),
    NODE_ENV: 'test',
  });
  const context = () => ({ tenantId, schemaName, tenantSlug: 'br2-fixture' });
  const run = <T>(fn: () => Promise<T>) => TenantContext.run(context(), fn);
  const sql = <T = Record<string, unknown>>(query: string, args: unknown[] = []) =>
    runInTenantSchema(ds, schemaName, (qr) => qr.query(query, args) as Promise<T[]>);
  async function seed(
    input: {
      start?: string;
      price?: string | null;
      document?: string | null;
      partyId?: string;
      status?: string;
      reason?: string;
      terminated?: string;
    } = {},
  ) {
    const id = randomUUID(),
      subscriber = randomUUID(),
      party = input.partyId ?? randomUUID();
    await sql(
      `INSERT INTO subscribers (id,tenant_id,party_id,person_type,document_type,business_name) VALUES ($1,$2,$3,'JURIDICA','NIT','Titular sintético')`,
      [subscriber, tenantId, party],
    );
    await sql(
      `INSERT INTO contracts (id,tenant_id,subscriber_id,status,status_reason_code,terminated_at,billing_cycle_day,start_date,plan_snapshot_json,vat_snapshot,fiscal_document) VALUES ($1,$2,$3,$4,$5,$6,5,$7,$8::jsonb,$9::jsonb,$10)`,
      [
        id,
        tenantId,
        subscriber,
        input.status ?? 'ACTIVE',
        input.reason ?? null,
        input.terminated ?? null,
        input.start ?? '2026-10-05',
        JSON.stringify({
          name: 'Plan sintético',
          monthlyPrice: input.price === undefined ? '100.00' : input.price,
        }),
        JSON.stringify({
          treatment: 'STANDARD',
          legalBasis: 'ET-468',
          ratePercent: 19,
          requiresAccountantReview: false,
          resolvedAt: '2026-10-01T00:00:00Z',
        }),
        input.document === undefined ? '900000001' : input.document,
      ],
    );
    return { id, subscriber, party };
  }
  async function draft(contractId: string, date = '2026-11-05') {
    await run(() => generation.generate({ contractId, date, actorId }));
    const [row] = await sql<{ id: string }>(
      `SELECT id FROM billing_documents WHERE contract_id=$1 AND status='BORRADOR'`,
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
    events.onAny((event) => {
      emitted.push(String(event));
    });
  });
  beforeEach(async () => {
    jest.clearAllMocks();
    emitted.length = 0;
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
  it('BR-2.12 usa la restricción de consecutivo de la 173', async () => {
    const names = await sql<{ conname: string }>(
      `SELECT conname FROM pg_constraint WHERE conrelid='billing_documents'::regclass AND contype='u'`,
    );
    expect(names.map((x) => x.conname)).toContain('billing_documents_tenant_id_number_key');
  });
  it('BR-2.2 aísla un fallo de contrato, continúa el lote y distingue altas futuras', async () => {
    const a = await seed();
    await seed();
    await seed({ start: '2027-01-01' });
    const original = adapter.findByContractId.bind(adapter);
    jest.spyOn(adapter, 'findByContractId').mockImplementation(async (id) => {
      if (id === a.id) throw new Error('fixture');
      return original(id);
    });
    const summary = await run(() => generation.generate({ date: '2026-11-05' }));
    expect(summary).toMatchObject({ failed: 1, generated: 1, omittedTermination: 0 });
    jest.restoreAllMocks();
  });
  it.each(['VENCIDO', 'ANTICIPADO'])(
    'BR-2.3 cobra el tramo inicial JUNTO_AL_SIGUIENTE %s',
    async (timing) => {
      await sql(
        `UPDATE billing_policy SET period_timing=$1,first_period_mode='JUNTO_AL_SIGUIENTE'`,
        [timing],
      );
      const c = await seed({ start: '2026-10-20' });
      await draft(c.id, timing === 'VENCIDO' ? '2026-12-05' : '2026-11-05');
      expect(
        await sql<{ covered_start: string }>('SELECT covered_start::text FROM billing_periods'),
      ).toEqual([{ covered_start: '2026-10-20' }]);
    },
  );
  it('BR-2.6 emite 20 documentos con adaptador CRM real y pool 10', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 20; i++) {
      const c = await seed();
      ids.push(await draft(c.id));
    }
    const results = await run(() => Promise.all(ids.map((id) => documents.issue([id], actorId))));
    expect(results.flat()).toHaveLength(20);
    expect(
      (await sql<{ number: string }>('SELECT number FROM billing_documents ORDER BY number')).map(
        (x) => x.number,
      ),
    ).toEqual(Array.from({ length: 20 }, (_, i) => `DC-${String(i + 1).padStart(6, '0')}`));
  });
  it('BR-2.7 reintenta la colisión con el nombre de la restricción real', async () => {
    const c = await seed();
    const id = await draft(c.id);
    const original = ds.createQueryRunner.bind(ds);
    let conflict = true;
    jest.spyOn(ds, 'createQueryRunner').mockImplementation((...args) => {
      const qr = original(...args);
      const query = qr.query.bind(qr);
      qr.query = jest.fn().mockImplementation(async (sqlText: string, ...rest: unknown[]) => {
        if (conflict && sqlText.includes("SET status = 'EMITIDO'")) {
          conflict = false;
          throw {
            driverError: { code: '23505', constraint: 'billing_documents_tenant_id_number_key' },
          };
        }
        return query(sqlText, rest[0] as unknown[] | undefined);
      });
      return qr;
    });
    await expect(run(() => documents.issue([id], actorId))).resolves.toHaveLength(1);
    jest.restoreAllMocks();
  });
  it('BR-2.8 bloquea los datos fiscales ausentes, también con aprobación automática', async () => {
    await sql("UPDATE billing_policy SET approval_mode='AUTOMATICA'");
    const c = await seed({ document: null });
    const id = await draft(c.id);
    expect(await sql('SELECT status,blocking_reason FROM billing_documents')).toEqual([
      { status: 'BORRADOR', blocking_reason: 'SIN_DATOS_FISCALES' },
    ]);
    await expect(run(() => documents.issue([id], actorId))).rejects.toMatchObject({
      status: 422,
      response: { code: 'BILLING_DOCUMENT_BLOCKED' },
    });
  });
  it('BR-2.10 dos pagos FIFO simultáneos dejan el exceso como saldo a favor', async () => {
    const c = await seed();
    const id = await draft(c.id);
    await run(() => documents.issue([id], actorId));
    const paid = await run(() =>
      Promise.all(
        [1, 2].map((i) =>
          payments.registerPayment(
            {
              subscriberId: c.subscriber,
              amount: '119.00',
              method: 'TRANSFERENCIA',
              paidAt: '2026-11-05',
            },
            `fifo-${i}`,
            actorId,
          ),
        ),
      ),
    );
    expect(paid).toHaveLength(2);
    const statement = await run(() => payments.statementForSubscriber(c.subscriber));
    expect(statement.creditBalance).toBe('119.00');
  });
  it('BR-2.5 anular documento pagado recalcula señal y emite reopened después del commit', async () => {
    const c = await seed();
    const id = await draft(c.id);
    await run(() => documents.issue([id], actorId));
    await run(() =>
      payments.registerPayment(
        {
          subscriberId: c.subscriber,
          amount: '119.00',
          method: 'TRANSFERENCIA',
          paidAt: '2026-11-05',
        },
        'void-document',
        actorId,
      ),
    );
    await run(() => documents.void(id, 'ERROR_DE_VALOR', undefined, actorId));
    expect(await sql('SELECT paid FROM billing_period_signals')).toEqual([{ paid: false }]);
    expect(emitted).toEqual(['billing.contract-period.paid', 'billing.contract-period.reopened']);
  });
  it('BR-2.13 omite víctima y suspendido por suplantación', async () => {
    const a = await seed();
    await seed({ status: 'SUSPENDED', reason: 'SUPLANTACION' });
    privacy.activeMarks.mockResolvedValue({ [a.party]: ['VICTIMA_FALSEDAD_PERSONAL'] });
    expect(await run(() => generation.generate({ date: '2026-11-05' }))).toMatchObject({
      omittedImpersonation: 2,
    });
    expect(await sql('SELECT id FROM billing_documents')).toHaveLength(0);
  });
  it('BR-2.13 emisor incompleto no consume consecutivo y AUTOMATICA sí emite', async () => {
    const c = await seed();
    const id = await draft(c.id);
    issuer.getIssuerIdentity.mockResolvedValueOnce({
      legalName: '',
      nit: '',
      verificationDigit: null,
    });
    await expect(run(() => documents.issue([id], actorId))).rejects.toMatchObject({
      status: 422,
      response: { code: 'BILLING_ISSUER_INCOMPLETE' },
    });
    expect((await run(() => documents.issue([id], actorId)))[0]?.number).toBe('DC-000001');
    await sql("UPDATE billing_policy SET approval_mode='AUTOMATICA'");
    await seed();
    await run(() => generation.generate({ date: '2026-11-05' }));
    expect(await sql("SELECT id FROM billing_documents WHERE status='EMITIDO'")).toHaveLength(2);
  });
  it.each(['discard', 'void'])(
    'BR-2.15 regeneración manual tras %s conserva política, job no recrea',
    async (mode) => {
      const c = await seed();
      const id = await draft(c.id);
      const before = await sql('SELECT effective_policy FROM billing_periods');
      if (mode === 'discard') await run(() => documents.discard(id, actorId));
      else {
        await run(() => documents.issue([id], actorId));
        await run(() => documents.void(id, 'ERROR_DE_VALOR', undefined, actorId));
      }
      await sql(
        `UPDATE contracts SET plan_snapshot_json='{"name":"Corregido","monthlyPrice":"200.00"}'::jsonb WHERE id=$1`,
        [c.id],
      );
      await run(() => generation.generate({ date: '2026-11-05' }));
      expect(await sql("SELECT id FROM billing_documents WHERE status='BORRADOR'")).toHaveLength(0);
      const next = await draft(c.id);
      expect(next).not.toBe(id);
      expect(await sql('SELECT effective_policy FROM billing_periods')).toEqual(before);
      expect((await run(() => documents.issue([next], actorId)))[0]?.number).toBe(
        mode === 'void' ? 'DC-000002' : 'DC-000001',
      );
      if (mode === 'void')
        expect(await sql('SELECT status,number FROM billing_documents WHERE id=$1', [id])).toEqual([
          { status: 'ANULADO', number: 'DC-000001' },
        ]);
    },
  );
  it('BR-3.1 el tramo inicial solo aplica si el alta cae en el periodo inmediatamente anterior', async () => {
    await sql(`UPDATE billing_policy SET first_period_mode='JUNTO_AL_SIGUIENTE'`);
    const old = await seed({ start: '2025-11-05' });
    const recent = await seed({ start: '2026-09-20' });
    await run(() => generation.generate({ contractId: old.id, date: '2026-11-05', actorId }));
    await run(() => generation.generate({ contractId: recent.id, date: '2026-11-05', actorId }));
    const rows = await sql<{ contract_id: string; covered_start: string; period_start: string }>(
      'SELECT contract_id, covered_start::text, period_start::text FROM billing_periods',
    );
    expect(rows.find((x) => x.contract_id === old.id)).toMatchObject({
      period_start: '2026-10-05',
      covered_start: '2026-10-05',
    });
    expect(rows.find((x) => x.contract_id === recent.id)).toMatchObject({
      period_start: '2026-10-05',
      covered_start: '2026-09-20',
    });
  });
  it.each(['discard', 'void'])(
    'BR-3.2 la reemisión tras %s conserva el método de prorrateo congelado',
    async (mode) => {
      const c = await seed({ start: '2026-10-20' });
      const id = await draft(c.id);
      const [first] = await sql<{ subtotal: string }>(
        'SELECT subtotal FROM billing_documents WHERE id=$1',
        [id],
      );
      if (mode === 'discard') await run(() => documents.discard(id, actorId));
      else {
        await run(() => documents.issue([id], actorId));
        await run(() => documents.void(id, 'ERROR_DE_VALOR', undefined, actorId));
      }
      await sql(`UPDATE billing_policy SET proration_method='MES_30'`);
      const next = await draft(c.id);
      const [again] = await sql<{ subtotal: string }>(
        'SELECT subtotal FROM billing_documents WHERE id=$1',
        [next],
      );
      expect(again?.subtotal).toBe(first?.subtotal);
      // DIAS_REALES 100 × 16/31 = 51,61 → 52 en pesos enteros; MES_30 daría 53.
      expect(again?.subtotal).toBe('52.00');
    },
  );
  it('BR-3.2 la reemisión conserva la aprobación congelada: no emite con AUTOMATICA nueva', async () => {
    const c = await seed();
    const id = await draft(c.id);
    await run(() => documents.discard(id, actorId));
    await sql(`UPDATE billing_policy SET approval_mode='AUTOMATICA'`);
    const next = await draft(c.id);
    expect(await sql('SELECT status,number FROM billing_documents WHERE id=$1', [next])).toEqual([
      { status: 'BORRADOR', number: null },
    ]);
  });
  it.each(['discard', 'void'])(
    'BR-3.2 la reemisión tras %s con JUNTO_AL_SIGUIENTE conserva el tramo inicial',
    async (mode) => {
      await sql(`UPDATE billing_policy SET first_period_mode='JUNTO_AL_SIGUIENTE'`);
      const c = await seed({ start: '2026-10-20' });
      const id = await draft(c.id, '2026-12-05');
      const [first] = await sql<{ subtotal: string }>(
        'SELECT subtotal FROM billing_documents WHERE id=$1',
        [id],
      );
      if (mode === 'discard') await run(() => documents.discard(id, actorId));
      else {
        await run(() => documents.issue([id], actorId));
        await run(() => documents.void(id, 'ERROR_DE_VALOR', undefined, actorId));
      }
      const next = await draft(c.id, '2026-12-05');
      const [again] = await sql<{ subtotal: string }>(
        'SELECT subtotal FROM billing_documents WHERE id=$1',
        [next],
      );
      expect(await sql('SELECT covered_start::text FROM billing_periods')).toEqual([
        { covered_start: '2026-10-20' },
      ]);
      expect(again?.subtotal).toBe(first?.subtotal);
    },
  );
  it('BR-2.13 lectura bloqueada en lista, detalle y PDF audita antes de revelar; fallo de auditoría es 503', async () => {
    const c = await seed();
    const id = await draft(c.id);
    await run(() => documents.issue([id], actorId));
    privacy.activeMarks.mockResolvedValue({ [c.party]: ['DATOS_BLOQUEADOS'] });
    expect(
      (await run(() => documents.list({ page: 1, limit: 25 }, actorId))).data[0]?.buyerSnapshot
        ?.displayName,
    ).toBe('[Dato protegido por custodia legal]');
    expect(
      (await run(() => documents.findOne(id, actorId))).buyerSnapshot?.documentNumber,
    ).toBeNull();
    const hidden = await run(() => documents.pdfDocument(id, actorId));
    expect(hidden.buyerSnapshot?.displayName).toBe('[Dato protegido por custodia legal]');
    await renderBillingDocumentPdf(hidden);
    permissions.getEffectivePermissionsForUser.mockResolvedValue(['crm.blocked_data.read']);
    const revealed = await run(() => documents.findOne(id, actorId));
    expect(revealed.buyerSnapshot?.documentNumber).toBe('900000001');
    expect(
      (await run(() => documents.list({ page: 1, limit: 25 }, actorId))).data[0]?.buyerSnapshot
        ?.documentNumber,
    ).toBeNull();
    expect(
      (await run(() => documents.pdfDocument(id, actorId))).buyerSnapshot?.documentNumber,
    ).toBe('900000001');
    expect(
      audit.logWithin.mock.calls.filter(([entry]) =>
        ['RECORD_ACCESS', 'LIST_ACCESS'].includes(entry.action),
      ),
    ).toHaveLength(3);
    audit.logWithin.mockRejectedValueOnce(new Error('fixture'));
    await expect(run(() => documents.findOne(id, actorId))).rejects.toMatchObject({
      status: 503,
      response: { code: 'PRIVACY_AUDIT_UNAVAILABLE' },
    });
  });
  it('BR-2.13 CA-FAC-05 rechaza emitir precio o IVA ausente', async () => {
    const c = await seed({ price: null });
    const id = await draft(c.id);
    await expect(run(() => documents.issue([id], actorId))).rejects.toMatchObject({
      status: 422,
      response: { code: 'BILLING_DOCUMENT_BLOCKED' },
    });
    const d = await seed();
    await sql('UPDATE contracts SET vat_snapshot=NULL WHERE id=$1', [d.id]);
    const dId = await draft(d.id);
    await expect(run(() => documents.issue([dId], actorId))).rejects.toMatchObject({ status: 422 });
  });
  it('BR-2.13 CA-FAC-09 cambiar política no modifica fechas ni valores ya generados', async () => {
    const c = await seed();
    await draft(c.id);
    const before = await sql('SELECT * FROM billing_periods');
    const values = await sql('SELECT total FROM billing_documents');
    await sql(
      "UPDATE billing_policy SET period_timing='ANTICIPADO',payment_term_days=45,proration_method='MES_30'",
    );
    await run(() => generation.generate({ contractId: c.id, date: '2026-11-05', actorId }));
    // Puede generarse otro periodo objetivo; el ya generado permanece intacto.
    const [original] = before as Array<{ id: string }>;
    expect(await sql('SELECT * FROM billing_periods WHERE id=$1', [original!.id])).toEqual(before);
    expect(
      await sql('SELECT total FROM billing_documents WHERE period_id=$1', [original!.id]),
    ).toEqual(values);
  });
  it('BR-2.13 CA-FAC-10 devuelve los cinco estados desde PostgreSQL', async () => {
    const contracts: string[] = [];
    const subs: string[] = [];
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const c = await seed();
      contracts.push(c.id);
      subs.push(c.subscriber);
      ids.push(await draft(c.id));
    }
    await run(() => documents.issue(ids.slice(1), actorId));
    await sql("UPDATE billing_periods SET cutoff_date='2026-11-20',due_date='2026-11-25'");
    await sql("UPDATE billing_periods SET due_date='2026-11-01' WHERE contract_id=$1", [
      contracts[2],
    ]);
    for (const index of [1, 3])
      await run(() =>
        payments.registerPayment(
          {
            subscriberId: subs[index],
            method: 'TRANSFERENCIA',
            amount: index === 1 ? '119.00' : '20.00',
            paidAt: '2026-11-05',
          },
          `states-${index}`,
          actorId,
        ),
      );
    expect(
      Object.fromEntries(
        Object.entries(await run(() => payments.periodStates(contracts, '2026-11-20'))).map(
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
  it('BR-2.13 CA-FAC-13 auditoría dentro de transacción y fallo revierte la emisión', async () => {
    const c = await seed();
    const id = await draft(c.id);
    audit.logWithin.mockImplementation(async (_entry, manager) => {
      expect(manager.queryRunner?.isTransactionActive).toBe(true);
    });
    audit.logWithin.mockRejectedValueOnce(new Error('fixture'));
    await expect(run(() => documents.issue([id], actorId))).rejects.toThrow('fixture');
    expect(await sql('SELECT status,number FROM billing_documents WHERE id=$1', [id])).toEqual([
      { status: 'BORRADOR', number: null },
    ]);
    await run(() => documents.issue([id], actorId));
    await run(() =>
      payments.registerPayment(
        {
          subscriberId: c.subscriber,
          method: 'TRANSFERENCIA',
          amount: '120.00',
          paidAt: '2026-11-05',
        },
        'audit-payment',
        actorId,
      ),
    );
    const payment = await sql<{ id: string }>('SELECT id FROM billing_payments');
    await run(() =>
      payments.voidPayment(payment[0]!.id, { reasonCode: 'ERROR_DE_REGISTRO' }, actorId),
    );
    await run(() => documents.void(id, 'ERROR_DE_VALOR', undefined, actorId));
    expect(audit.logWithin.mock.calls.map(([entry]) => entry.entityType)).toEqual(
      expect.arrayContaining(['BillingDocument', 'BillingPayment']),
    );
  });
  it.each(['manual', 'job', 'disabled'])(
    'BR-2.14 aplica crédito al emitir vía %s y conserva autor nullable',
    async (mode) => {
      const c = await seed();
      const first = await draft(c.id);
      await run(() => documents.issue([first], actorId));
      const pay = await run(() =>
        payments.registerPayment(
          {
            subscriberId: c.subscriber,
            method: 'TRANSFERENCIA',
            amount: '300.00',
            paidAt: '2026-11-05',
          },
          'credit-on-issue',
          actorId,
        ),
      );
      await sql(`UPDATE billing_policy SET auto_apply_credit=$1,approval_mode=$2`, [
        mode !== 'disabled',
        mode === 'job' ? 'AUTOMATICA' : 'BORRADOR',
      ]);
      await run(() => generation.generate({ contractId: c.id, date: '2026-12-05' }));
      const [next] = await sql<{ id: string }>(
        `SELECT d.id FROM billing_documents d JOIN billing_periods p ON p.id=d.period_id WHERE p.period_start='2026-11-05'`,
      );
      if (!next) throw new Error('Falta siguiente documento');
      if (mode !== 'job') await run(() => documents.issue([next.id], actorId));
      const response = await run(() => payments.getPayment(pay.id));
      const added = response.allocations?.filter((x) => x.documentId === next.id) ?? [];
      expect(added).toHaveLength(mode === 'disabled' ? 0 : 1);
      if (mode !== 'disabled')
        expect(added[0]).toMatchObject({
          amount: '119.00',
          createdBy: mode === 'job' ? null : actorId,
        });
      expect(emitted.filter((x) => x === 'billing.contract-period.paid')).toHaveLength(
        mode === 'disabled' ? 1 : 2,
      );
      const state = await sql<{ paid: boolean }>(
        'SELECT paid FROM billing_period_signals WHERE period_id=(SELECT period_id FROM billing_documents WHERE id=$1)',
        [next.id],
      );
      if (mode !== 'disabled') expect(state).toEqual([{ paid: true }]);
      expect((await run(() => payments.statementForSubscriber(c.subscriber))).creditBalance).toBe(
        mode === 'disabled' ? '181.00' : '62.00',
      );
    },
  );

  it('BR-8.2 emitir no descifra el documento fiscal de un borrador rechazado (RS-9)', async () => {
    const c = await seed();
    // El documento queda solo cifrado: si la emisión lo necesitara, tendría que descifrarlo.
    const encryptConfig = new ConfigService({
      PII_ENCRYPTION_KEY: '12'.repeat(32),
      MFA_ENCRYPTION_KEY: '12'.repeat(32),
      PII_HASH_KEY: '34'.repeat(32),
      NODE_ENV: 'test',
    });
    const fiscalCrypto = createFiscalDocumentCrypto(encryptConfig);
    await sql(
      `UPDATE contracts SET fiscal_document_encrypted = $1, fiscal_document = NULL WHERE id = $2`,
      [fiscalCrypto.encrypt('900000001')?.encrypted, c.id],
    );
    const id = await draft(c.id);
    await sql(`UPDATE billing_documents SET blocking_reason = 'SIN_PRECIO' WHERE id = $1`, [id]);
    const decrypt = jest.spyOn(
      (
        adapter as unknown as {
          fiscalDocumentCrypto: { decrypt: (value: string) => string };
        }
      ).fiscalDocumentCrypto,
      'decrypt',
    );
    try {
      await expect(run(() => documents.issue([id], actorId))).rejects.toMatchObject({
        status: 422,
      });
      expect(decrypt).not.toHaveBeenCalled();
    } finally {
      decrypt.mockRestore();
    }
  });
});
