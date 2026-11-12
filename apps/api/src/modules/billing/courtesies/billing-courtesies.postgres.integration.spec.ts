import {
  createBillingTenantFixture,
  dropBillingTenantFixture,
} from '../../../../../../packages/database/src/migrations/tenant/billing-migration.integration-helpers';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../packages/database/src/migrations/tenant/runner';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, EntityManager } from 'typeorm';
import { dataSourceOptions, runInTenantSchema, TenantContext } from '@iwana/db';
import { AuditAction, BILLING_ERROR_CODES, type GrantCourtesyCommand } from '@iwana/shared';
import { BillingDocumentsService } from '../documents/billing-documents.service';
import { BillingPaymentsService } from '../payments/billing-payments.service';
import { BillingCourtesiesService } from './billing-courtesies.service';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const databaseName = dataSourceOptions.database;
const safeDatabaseName =
  typeof databaseName === 'string' && /^(test|iwana_it_[a-z0-9_]+)$/u.test(databaseName);
const describeWithDb = dbAvailable && safeDatabaseName ? describe : describe.skip;

type LineInput = {
  kind: 'PLAN' | 'PRORRATEO' | 'INSTALACION' | 'ADICIONAL';
  base: string;
  tax: string;
  total: string;
  vatTreatment: string;
  vatRate: string;
};

/**
 * Cortesías de MOD14 contra PostgreSQL real (spec 2026-11-12 D4, D5, R4, R5, R6, CA-3).
 * Esquema: cadena completa de migraciones tenant (incluye 203 y 204).
 */
describeWithDb('BillingCourtesiesService contra PostgreSQL real', () => {
  let dataSource: DataSource;
  let fixture: Awaited<ReturnType<typeof createBillingTenantFixture>> | undefined;
  let tenantId: string;
  let schemaName: string;
  let courtesies: BillingCourtesiesService;
  let documents: BillingDocumentsService;
  let payments: BillingPaymentsService;
  let events: EventEmitter2;
  let emitted: string[];
  let failNextAudit: boolean;
  let privacyMarks: { activeMarks: jest.Mock };
  const actorId = randomUUID();
  const subscriberId = randomUUID();
  const contractId = randomUUID();
  const partyId = randomUUID();

  const ctx = () => ({ tenantId, schemaName, tenantSlug: 'billing-courtesies-it' });
  const inTenant = <T>(fn: () => Promise<T>) => TenantContext.run(ctx(), fn);
  const sql = <T = unknown>(text: string, params: unknown[] = []) =>
    runInTenantSchema(dataSource, schemaName, (qr) => qr.query(text, params) as Promise<T>);

  async function insertPeriod(start: string, end: string, due: string): Promise<string> {
    const id = randomUUID();
    await sql(
      `INSERT INTO billing_periods (id, tenant_id, contract_id, subscriber_id, period_start,
         period_end, covered_start, generation_date, due_date, effective_policy)
       VALUES ($1, $2, $3, $4, $5::date, $6::date, $5::date, $5::date, $7::date, '{}'::jsonb)`,
      [id, tenantId, contractId, subscriberId, start, end, due],
    );
    return id;
  }

  async function insertDocument(input: {
    status: 'BORRADOR' | 'EMITIDO' | 'IMPORTADO';
    periodId: string | null;
    dueDate: string;
    lines: LineInput[];
  }): Promise<{ id: string; lineIds: string[] }> {
    const id = randomUUID();
    const cents = (v: string) => Math.round(Number(v) * 100);
    const sum = (key: 'base' | 'tax' | 'total') =>
      (input.lines.reduce((acc, line) => acc + cents(line[key]), 0) / 100).toFixed(2);
    const imported = input.status === 'IMPORTADO';
    await sql(
      `INSERT INTO billing_documents (id, tenant_id, period_id, contract_id, subscriber_id, status,
         number, issue_date, due_date, subtotal, tax_total, total, buyer_snapshot,
         external_id, external_number, import_batch_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9::date, $10, $11, $12, $13::jsonb,
               $14, $15, $16)`,
      [
        id,
        tenantId,
        input.periodId,
        contractId,
        subscriberId,
        input.status,
        input.status === 'EMITIDO' ? `DC-${id.slice(0, 8)}` : null,
        input.status === 'BORRADOR' ? null : '2026-10-31',
        input.dueDate,
        sum('base'),
        sum('tax'),
        sum('total'),
        JSON.stringify({ displayName: 'Titular sintético', rutResponsibilities: [] }),
        imported ? `uisp:invoice:${id}` : null,
        imported ? 'UISP-1' : null,
        imported ? randomUUID() : null,
      ],
    );
    const lineIds: string[] = [];
    for (const [position, line] of input.lines.entries()) {
      const rows = await sql<Array<{ id: string }>>(
        `INSERT INTO billing_document_lines (tenant_id, document_id, kind, description, quantity,
           unit_price, base_amount, tax_amount, total, vat_treatment, vat_rate, position)
         VALUES ($1, $2, $3, $4, 1, $5, $5, $6, $7, $8, $9, $10) RETURNING id::text`,
        [
          tenantId,
          id,
          line.kind,
          line.kind === 'PRORRATEO' ? 'Prorrateo octubre' : `Línea ${line.kind}`,
          line.base,
          line.tax,
          line.total,
          line.vatTreatment,
          line.vatRate,
          position,
        ],
      );
      lineIds.push(rows[0]!.id);
    }
    return { id, lineIds };
  }

  async function allocatePayment(documentId: string, amount: string): Promise<void> {
    const paymentId = randomUUID();
    await sql(
      `INSERT INTO billing_payments (id, tenant_id, subscriber_id, method, amount, paid_at,
         idempotency_key, created_by)
       VALUES ($1, $2, $3, 'EFECTIVO', $4, '2026-11-02', $5, $6)`,
      [paymentId, tenantId, subscriberId, amount, `k-${paymentId}`, actorId],
    );
    await sql(
      `INSERT INTO billing_payment_allocations (tenant_id, payment_id, document_id, amount, created_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [tenantId, paymentId, documentId, amount, actorId],
    );
  }

  async function signal(periodId: string): Promise<boolean | null> {
    const rows = await sql<Array<{ paid: boolean }>>(
      'SELECT paid FROM billing_period_signals WHERE period_id = $1',
      [periodId],
    );
    return rows[0]?.paid ?? null;
  }

  const grant = (documentId: string, command: GrantCourtesyCommand, key: string = randomUUID()) =>
    inTenant(() => courtesies.grant(documentId, command, actorId, key));
  const detail = (documentId: string) => inTenant(() => documents.findOne(documentId, actorId));

  async function expectCode(promise: Promise<unknown>, status: number, code: string) {
    await expect(promise).rejects.toMatchObject({
      status,
      response: expect.objectContaining({ code }),
    });
  }

  beforeAll(async () => {
    dataSource = new DataSource({
      ...dataSourceOptions,
      entities: [],
      migrations: [],
      logging: false,
      extra: { ...dataSourceOptions.extra, max: 10, min: 1 },
    });
    await dataSource.initialize();
    fixture = await createBillingTenantFixture(dataSource, 'tenant_billing173');
    schemaName = fixture.schemaName;
    tenantId = fixture.tenantId;
    await fixture.queryRunner.release();
    const tenantDataSource = createTenantDataSource(
      dataSource,
      schemaName,
      `billing-courtesies-${tenantId.slice(0, 8)}`,
    );
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }
    await sql(`
      CREATE TABLE test_courtesy_audit (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entity_type text NOT NULL,
        entity_id text NOT NULL, action text NOT NULL, user_id uuid NULL, new_value jsonb NULL
      )`);
    await sql(
      `INSERT INTO subscribers (id, tenant_id, party_id, status, person_type, customer_segment,
         document_type, document_number_encrypted, first_name, last_name, stratum, vat_treatment,
         vat_responsibility, address, created_by)
       VALUES ($1, $2, $3, 'ACTIVE', 'NATURAL', 'RESIDENTIAL', 'CC', 'sintetico-cifrado',
               'Titular', 'Sintético', 2, 'EXEMPT', 'NO_RESPONSABLE', 'Dirección sintética', $4)`,
      [subscriberId, tenantId, partyId, actorId],
    );
    await sql(
      `INSERT INTO contracts (id, tenant_id, subscriber_id, status, plan_id, plan_snapshot_json)
       VALUES ($1, $2, $3, 'ACTIVE', 'fixture-plan', '{}'::jsonb)`,
      [contractId, tenantId, subscriberId],
    );

    // Auditoría real en la transacción del llamador: escribe con el mismo manager.
    const audit = {
      logWithin: jest.fn(
        async (
          entry: {
            entityType: string;
            entityId: string;
            action: string;
            userId?: string | null;
            newValue?: unknown;
          },
          manager: EntityManager,
        ) => {
          if (failNextAudit) {
            failNextAudit = false;
            throw new Error('auditoría caída');
          }
          await manager.query(
            `INSERT INTO test_courtesy_audit (entity_type, entity_id, action, user_id, new_value)
             VALUES ($1, $2, $3, $4, $5::jsonb)`,
            [
              entry.entityType,
              entry.entityId,
              entry.action,
              entry.userId ?? null,
              JSON.stringify(entry.newValue ?? null),
            ],
          );
        },
      ),
    };
    const contractRead = {
      findTitularRefs: jest.fn(async (ids: string[]) =>
        ids.map((id) => ({ subscriberId: id, partyId, anonymized: false })),
      ),
      lockTitularForBillingWrite: jest.fn(async () => ({
        exists: true,
        partyId,
        anonymized: false,
      })),
      hasImpersonationSuspension: jest.fn(async () => false),
      findActiveContractIds: jest.fn(async () => [contractId]),
      findTitularDisplayNames: jest.fn(async () => []),
    };
    privacyMarks = { activeMarks: jest.fn(async () => ({})) };
    const tenantSettings = { getSnapshot: jest.fn(async () => ({ timezone: 'America/Bogota' })) };
    events = new EventEmitter2();
    events.emitAsync = jest.fn(async (name: string | symbol) => {
      emitted.push(String(name));
      return [];
    }) as never;
    payments = new BillingPaymentsService(
      dataSource,
      contractRead as never,
      audit as never,
      events,
      privacyMarks as never,
      tenantSettings as never,
    );
    const key = '4ef6bb844c9e858d2a93b5585599d419f79148fc24b5d9b0e03f5a53fa146d27';
    documents = new BillingDocumentsService(
      dataSource,
      audit as never,
      contractRead as never,
      {} as never,
      new ConfigService({ NODE_ENV: 'test', MFA_ENCRYPTION_KEY: key, PII_ENCRYPTION_KEY: key }),
      { getEffectivePermissionsForUser: jest.fn(async () => []) } as never,
      tenantSettings as never,
      privacyMarks as never,
      payments,
    );
    courtesies = new BillingCourtesiesService(
      dataSource,
      audit as never,
      contractRead as never,
      payments,
    );
  }, 600_000);

  beforeEach(async () => {
    emitted = [];
    failNextAudit = false;
    privacyMarks.activeMarks.mockReset().mockResolvedValue({});
    await sql(
      `TRUNCATE billing_courtesies, billing_period_signals, billing_payment_allocations,
         billing_payments, billing_document_lines, billing_documents, billing_periods,
         test_courtesy_audit RESTART IDENTITY CASCADE`,
    );
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dropBillingTenantFixture(dataSource, fixture);
  });

  const prorrateo: LineInput = {
    kind: 'PRORRATEO',
    base: '3548.39',
    tax: '0.00',
    total: '3548.39',
    vatTreatment: 'EXEMPT',
    vatRate: '0.0000',
  };

  it('204 siembra billing.courtesies.manage solo en las plantillas de Administración y Contable', async () => {
    const rows = await sql<Array<{ name: string }>>(
      `SELECT p.name FROM access_profile_permissions pp
         JOIN access_profiles p ON p.id = pp.profile_id
        WHERE pp.permission_key = 'billing.courtesies.manage' ORDER BY p.name`,
    );
    const catalog = await sql<Array<{ availability: string }>>(
      `SELECT availability FROM access_permission_catalog
        WHERE permission_key = 'billing.courtesies.manage'`,
    );
    expect(catalog).toEqual([{ availability: 'ASSIGNABLE' }]);
    expect(rows.map(({ name }) => name)).toEqual([
      'Acceso estándar Contable',
      'Administrador general',
    ]);
  });

  it('CA-3 emitido: regalar el prorrateo de octubre salda el documento y noviembre se cobra completo', async () => {
    const october = await insertPeriod('2026-10-30', '2026-10-31', '2026-11-13');
    const november = await insertPeriod('2026-11-01', '2026-11-30', '2099-12-14');
    const oct = await insertDocument({
      status: 'EMITIDO',
      periodId: october,
      dueDate: '2099-11-13',
      lines: [prorrateo],
    });
    const nov = await insertDocument({
      status: 'EMITIDO',
      periodId: november,
      dueDate: '2099-12-14',
      lines: [
        {
          kind: 'PLAN',
          base: '55000.00',
          tax: '0.00',
          total: '55000.00',
          vatTreatment: 'EXEMPT',
          vatRate: '0.0000',
        },
      ],
    });

    const created = await grant(oct.id, {
      target: 'LINEA',
      lineId: oct.lineIds[0]!,
      reasonCode: 'PRORRATEO_INICIAL',
      note: 'Alta del 30 de octubre',
    });
    expect(created).toMatchObject({
      application: 'AJUSTE_SOBRE_EMITIDO',
      target: 'LINEA',
      sourceLineId: oct.lineIds[0],
      lineId: null,
      amount: '3548.39',
      status: 'ACTIVA',
      createdBy: actorId,
    });

    const octDetail = await detail(oct.id);
    expect(octDetail).toMatchObject({
      paymentState: 'PAGADO',
      paidAmount: '0',
      courtesyAmount: '3548.39',
      pendingAmount: '0.00',
      // R6: la base gravable y el total emitidos no cambian; tampoco sus líneas.
      subtotal: '3548.39',
      taxTotal: '0.00',
      total: '3548.39',
    });
    expect(octDetail.lines).toHaveLength(1);
    expect(octDetail.courtesies).toEqual([expect.objectContaining({ id: created.id })]);
    expect(await signal(october)).toBe(true);
    expect(emitted).toEqual(['billing.contract-period.paid']);

    const novDetail = await detail(nov.id);
    expect(novDetail).toMatchObject({
      paymentState: 'PENDIENTE',
      courtesyAmount: '0.00',
      pendingAmount: '55000.00',
      total: '55000.00',
    });

    const statement = await inTenant(() => payments.statementForSubscriber(subscriberId));
    expect(statement).toMatchObject({
      totalInvoiced: '58548.39',
      totalPaid: '0.00',
      totalCourtesy: '3548.39',
      totalPending: '55000.00',
    });
    expect(statement.courtesies).toHaveLength(1);
    expect(statement.contractSummaries).toEqual([
      expect.objectContaining({ contractId, totalCourtesy: '3548.39', totalPending: '55000.00' }),
    ]);
    const states = await inTenant(() => payments.periodStates([contractId], '2026-11-12'));
    expect(states[contractId]).toEqual({
      state: 'PENDIENTE',
      paidAmount: '0.00',
      totalAmount: '55000.00',
    });

    const audits = await sql<Array<{ action: string; new_value: Record<string, unknown> }>>(
      `SELECT action, new_value FROM test_courtesy_audit WHERE entity_type = 'BillingCourtesy'`,
    );
    expect(audits).toEqual([
      {
        action: AuditAction.CREATE,
        new_value: expect.objectContaining({
          documentId: oct.id,
          reasonCode: 'PRORRATEO_INICIAL',
          amount: '3548.39',
          hasNote: true,
        }),
      },
    ]);
    expect(JSON.stringify(audits)).not.toContain('Alta del 30');
  });

  it('CA-3 borrador: la línea negativa regala el prorrateo y la anulación la retira', async () => {
    const october = await insertPeriod('2026-10-30', '2026-10-31', '2026-11-13');
    const draft = await insertDocument({
      status: 'BORRADOR',
      periodId: october,
      dueDate: '2099-11-13',
      lines: [
        prorrateo,
        {
          kind: 'INSTALACION',
          base: '50000.00',
          tax: '9500.00',
          total: '59500.00',
          vatTreatment: 'STANDARD',
          vatRate: '19.0000',
        },
      ],
    });

    await expectCode(
      grant(draft.id, { target: 'VALOR', amount: '1000.00', reasonCode: 'PROMOCION_COMERCIAL' }),
      422,
      BILLING_ERROR_CODES.BILLING_COURTESY_MIXED_VAT,
    );

    const created = await grant(draft.id, {
      target: 'LINEA',
      lineId: draft.lineIds[0]!,
      reasonCode: 'PRORRATEO_INICIAL',
    });
    expect(created.application).toBe('LINEA_EN_BORRADOR');
    let current = await detail(draft.id);
    expect(current).toMatchObject({ subtotal: '50000.00', taxTotal: '9500.00', total: '59500.00' });
    const line = current.lines?.find(({ kind }) => kind === 'CORTESIA');
    expect(line).toMatchObject({
      id: created.lineId,
      description: 'Cortesía: Prorrateo octubre',
      baseAmount: '-3548.39',
      taxAmount: '0.00',
      total: '-3548.39',
      vatTreatment: 'EXEMPT',
      position: 2,
    });

    await expectCode(
      grant(draft.id, {
        target: 'LINEA',
        lineId: draft.lineIds[0]!,
        reasonCode: 'OTRO',
        note: 'x',
      }),
      409,
      BILLING_ERROR_CODES.BILLING_COURTESY_LINE_NOT_ELIGIBLE,
    );
    await expectCode(
      grant(draft.id, { target: 'LINEA', lineId: created.lineId!, reasonCode: 'OTRO', note: 'x' }),
      409,
      BILLING_ERROR_CODES.BILLING_COURTESY_LINE_NOT_ELIGIBLE,
    );

    const voided = await inTenant(() =>
      courtesies.void(created.id, { reasonCode: 'DECISION_REVERTIDA' }, actorId, randomUUID()),
    );
    // La línea se retira: lineId pasa a null en la respuesta y en las lecturas.
    expect(voided).toMatchObject({
      status: 'ANULADA',
      voidReasonCode: 'DECISION_REVERTIDA',
      lineId: null,
    });
    expect((await detail(draft.id)).courtesies).toEqual([
      expect.objectContaining({ id: created.id, lineId: null }),
    ]);
    current = await detail(draft.id);
    expect(current).toMatchObject({ subtotal: '53548.39', taxTotal: '9500.00', total: '63048.39' });
    expect(current.lines?.some(({ kind }) => kind === 'CORTESIA')).toBe(false);
    expect(emitted).toEqual([]);
  });

  it('borrador por valor: separa base e IVA con la única tarifa y no deja el total negativo', async () => {
    const period = await insertPeriod('2026-11-01', '2026-11-30', '2026-11-14');
    const draft = await insertDocument({
      status: 'BORRADOR',
      periodId: period,
      dueDate: '2099-11-14',
      lines: [
        {
          kind: 'PLAN',
          base: '46218.49',
          tax: '8781.51',
          total: '55000.00',
          vatTreatment: 'STANDARD',
          vatRate: '19.0000',
        },
      ],
    });
    await expectCode(
      grant(draft.id, { target: 'VALOR', amount: '55000.01', reasonCode: 'FALLA_DEL_SERVICIO' }),
      409,
      BILLING_ERROR_CODES.BILLING_COURTESY_EXCEEDS_BALANCE,
    );
    await grant(draft.id, { target: 'VALOR', amount: '11900', reasonCode: 'FALLA_DEL_SERVICIO' });
    const current = await detail(draft.id);
    expect(current).toMatchObject({ subtotal: '36218.49', taxTotal: '6881.51', total: '43100.00' });
    expect(current.lines?.find(({ kind }) => kind === 'CORTESIA')).toMatchObject({
      unitPrice: '-10000.00',
      baseAmount: '-10000.00',
      taxAmount: '-1900.00',
      total: '-11900.00',
      vatRate: '19.0000',
    });
  });

  it('R5: nunca supera el saldo; la anulación devuelve el saldo y reabre el periodo', async () => {
    const period = await insertPeriod('2026-11-01', '2026-11-30', '2099-11-14');
    const doc = await insertDocument({
      status: 'EMITIDO',
      periodId: period,
      dueDate: '2099-11-14',
      lines: [{ ...prorrateo, kind: 'PLAN', base: '100.00', total: '100.00' }],
    });
    await allocatePayment(doc.id, '60.00');

    await expectCode(
      grant(doc.id, { target: 'VALOR', amount: '40.01', reasonCode: 'RETENCION_DEL_CLIENTE' }),
      409,
      BILLING_ERROR_CODES.BILLING_COURTESY_EXCEEDS_BALANCE,
    );
    // Regalar la línea completa (100) supera el saldo de 40.
    await expectCode(
      grant(doc.id, { target: 'LINEA', lineId: doc.lineIds[0]!, reasonCode: 'ERROR_OPERATIVO' }),
      409,
      BILLING_ERROR_CODES.BILLING_COURTESY_EXCEEDS_BALANCE,
    );
    const created = await grant(doc.id, {
      target: 'VALOR',
      amount: 40,
      reasonCode: 'RETENCION_DEL_CLIENTE',
    });
    expect(await detail(doc.id)).toMatchObject({
      paymentState: 'PAGADO',
      paidAmount: '60.00',
      courtesyAmount: '40.00',
      pendingAmount: '0.00',
    });
    expect(await signal(period)).toBe(true);
    await expectCode(
      grant(doc.id, { target: 'VALOR', amount: '0.01', reasonCode: 'RETENCION_DEL_CLIENTE' }),
      409,
      BILLING_ERROR_CODES.BILLING_COURTESY_EXCEEDS_BALANCE,
    );

    await inTenant(() =>
      courtesies.void(
        created.id,
        { reasonCode: 'VALOR_INCORRECTO', note: 'Se registró en otro cobro' },
        actorId,
        randomUUID(),
      ),
    );
    expect(await detail(doc.id)).toMatchObject({
      paymentState: 'PARCIAL',
      courtesyAmount: '0.00',
      pendingAmount: '40.00',
    });
    expect(await signal(period)).toBe(false);
    expect(emitted).toEqual(['billing.contract-period.paid', 'billing.contract-period.reopened']);
    await expectCode(
      inTenant(() =>
        courtesies.void(created.id, { reasonCode: 'ERROR_DE_REGISTRO' }, actorId, randomUUID()),
      ),
      409,
      BILLING_ERROR_CODES.BILLING_COURTESY_ALREADY_VOIDED,
    );
    const audits = await sql<Array<{ action: string }>>(
      `SELECT action FROM test_courtesy_audit WHERE entity_type = 'BillingCourtesy' ORDER BY action`,
    );
    expect(audits.map(({ action }) => action)).toEqual([AuditAction.CREATE, AuditAction.UPDATE]);
  });

  it('R5 con un pago posterior: la aplicación de pagos respeta el saldo que dejó la cortesía', async () => {
    const period = await insertPeriod('2026-11-01', '2026-11-30', '2099-11-14');
    const doc = await insertDocument({
      status: 'EMITIDO',
      periodId: period,
      dueDate: '2099-11-14',
      lines: [{ ...prorrateo, kind: 'PLAN', base: '100.00', total: '100.00' }],
    });
    await grant(doc.id, { target: 'VALOR', amount: '70.00', reasonCode: 'FALLA_DEL_SERVICIO' });
    const payment = await inTenant(() =>
      payments.registerPayment(
        { subscriberId, method: 'EFECTIVO', amount: '50.00', paidAt: '2026-11-12' },
        'courtesy-r5-payment',
        actorId,
      ),
    );
    // Sugerencia FIFO: solo 30 caben en el documento; el resto queda como saldo a favor.
    expect(payment.allocatedAmount).toBe('30.00');
    expect(await detail(doc.id)).toMatchObject({ paymentState: 'PAGADO', pendingAmount: '0.00' });
  });

  it('dos cortesías concurrentes no superan juntas el saldo', async () => {
    const period = await insertPeriod('2026-11-01', '2026-11-30', '2099-11-14');
    const doc = await insertDocument({
      status: 'EMITIDO',
      periodId: period,
      dueDate: '2099-11-14',
      lines: [{ ...prorrateo, kind: 'PLAN', base: '100.00', total: '100.00' }],
    });
    const results = await Promise.allSettled([
      grant(doc.id, { target: 'VALOR', amount: '60.00', reasonCode: 'PROMOCION_COMERCIAL' }),
      grant(doc.id, { target: 'VALOR', amount: '60.00', reasonCode: 'PROMOCION_COMERCIAL' }),
    ]);
    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    const rows = await sql<Array<{ total: string }>>(
      `SELECT COALESCE(SUM(amount), 0)::text AS total FROM billing_courtesies WHERE status = 'ACTIVA'`,
    );
    expect(rows[0]?.total).toBe('60.00');
  });

  it('IMPORTADO admite ajuste de cortesía y cuenta en cartera', async () => {
    const doc = await insertDocument({
      status: 'IMPORTADO',
      periodId: null,
      dueDate: '2099-11-14',
      lines: [{ ...prorrateo, kind: 'PLAN', base: '80.00', total: '80.00' }],
    });
    await grant(doc.id, { target: 'VALOR', amount: '80.00', reasonCode: 'ERROR_OPERATIVO' });
    expect(await detail(doc.id)).toMatchObject({ paymentState: 'PAGADO', pendingAmount: '0.00' });
    const statement = await inTenant(() => payments.statementForSubscriber(subscriberId));
    expect(statement).toMatchObject({ totalCourtesy: '80.00', totalPending: '0.00' });
    expect(emitted).toEqual([]);
  });

  it('ANULADO no admite cortesías ni su anulación; la línea de un borrador emitido no se anula', async () => {
    const period = await insertPeriod('2026-11-01', '2026-11-30', '2099-11-14');
    const doc = await insertDocument({
      status: 'EMITIDO',
      periodId: period,
      dueDate: '2099-11-14',
      lines: [{ ...prorrateo, kind: 'PLAN', base: '100.00', total: '100.00' }],
    });
    const created = await grant(doc.id, {
      target: 'VALOR',
      amount: '10.00',
      reasonCode: 'PROMOCION_COMERCIAL',
    });
    await sql(
      `UPDATE billing_documents SET status = 'ANULADO', void_reason_code = 'DUPLICADO',
         voided_at = now(), voided_by = $2 WHERE id = $1`,
      [doc.id, actorId],
    );
    await expectCode(
      grant(doc.id, { target: 'VALOR', amount: '1.00', reasonCode: 'PROMOCION_COMERCIAL' }),
      409,
      BILLING_ERROR_CODES.BILLING_COURTESY_DOCUMENT_NOT_ELIGIBLE,
    );
    await expectCode(
      inTenant(() =>
        courtesies.void(created.id, { reasonCode: 'ERROR_DE_REGISTRO' }, actorId, randomUUID()),
      ),
      409,
      BILLING_ERROR_CODES.BILLING_COURTESY_DOCUMENT_NOT_ELIGIBLE,
    );

    const draft = await insertDocument({
      status: 'BORRADOR',
      periodId: await insertPeriod('2026-12-01', '2026-12-31', '2099-12-14'),
      dueDate: '2099-12-14',
      lines: [prorrateo],
    });
    const lineCourtesy = await grant(draft.id, {
      target: 'LINEA',
      lineId: draft.lineIds[0]!,
      reasonCode: 'PRORRATEO_INICIAL',
    });
    expect((await detail(draft.id)).total).toBe('0.00');
    await sql(
      `UPDATE billing_documents SET status = 'EMITIDO', number = 'DC-999999',
         issue_date = '2026-11-12' WHERE id = $1`,
      [draft.id],
    );
    // Total 0 emitido: saldado sin pagos.
    expect(await detail(draft.id)).toMatchObject({
      paymentState: 'PAGADO',
      courtesyAmount: '0.00',
      pendingAmount: '0.00',
    });
    // «Cortesías otorgadas» suma la línea CORTESIA emitida; el ajuste del ANULADO no cuenta.
    const statement = await inTenant(() => payments.statementForSubscriber(subscriberId));
    expect(statement).toMatchObject({ totalCourtesy: '3548.39', totalPending: '0.00' });
    expect(statement.contractSummaries).toEqual([
      expect.objectContaining({ contractId, totalCourtesy: '3548.39' }),
    ]);
    await expectCode(
      inTenant(() =>
        courtesies.void(
          lineCourtesy.id,
          { reasonCode: 'ERROR_DE_REGISTRO' },
          actorId,
          randomUUID(),
        ),
      ),
      409,
      BILLING_ERROR_CODES.BILLING_COURTESY_NOT_VOIDABLE,
    );
  });

  it('la auditoría va en la misma transacción: si falla, la cortesía no queda', async () => {
    const period = await insertPeriod('2026-11-01', '2026-11-30', '2099-11-14');
    const doc = await insertDocument({
      status: 'EMITIDO',
      periodId: period,
      dueDate: '2099-11-14',
      lines: [{ ...prorrateo, kind: 'PLAN', base: '100.00', total: '100.00' }],
    });
    failNextAudit = true;
    await expect(
      grant(doc.id, { target: 'VALOR', amount: '100.00', reasonCode: 'PROMOCION_COMERCIAL' }),
    ).rejects.toThrow('auditoría caída');
    const rows = await sql<Array<{ count: number }>>(
      'SELECT COUNT(*)::int AS count FROM billing_courtesies',
    );
    expect(rows[0]?.count).toBe(0);
    expect(await signal(period)).toBeNull();
    expect(emitted).toEqual([]);
  });

  it('documento o cortesía inexistentes responden 404', async () => {
    await expectCode(
      grant(randomUUID(), { target: 'VALOR', amount: '1.00', reasonCode: 'OTRO', note: 'x' }),
      404,
      'BILLING_DOCUMENT_NOT_FOUND',
    );
    await expectCode(
      inTenant(() =>
        courtesies.void(randomUUID(), { reasonCode: 'ERROR_DE_REGISTRO' }, actorId, randomUUID()),
      ),
      404,
      BILLING_ERROR_CODES.BILLING_COURTESY_NOT_FOUND,
    );
  });

  it('Idempotency-Key: el doble envío de otorgar devuelve la misma cortesía; otro cuerpo, 409', async () => {
    const period = await insertPeriod('2026-11-01', '2026-11-30', '2099-11-14');
    const doc = await insertDocument({
      status: 'EMITIDO',
      periodId: period,
      dueDate: '2099-11-14',
      lines: [{ ...prorrateo, kind: 'PLAN', base: '100.00', total: '100.00' }],
    });
    const command: GrantCourtesyCommand = {
      target: 'VALOR',
      amount: '30.00',
      reasonCode: 'FALLA_DEL_SERVICIO',
      note: 'Corte del 3 de noviembre',
    };
    // Doble envío simultáneo con la misma clave: una sola fila, la misma respuesta.
    const [first, second] = await Promise.all([
      grant(doc.id, command, 'otorgar-doble'),
      grant(doc.id, command, 'otorgar-doble'),
    ]);
    expect(second).toEqual(first);
    // Reintento posterior: 30 numérico es el mismo comando que '30.00'.
    expect(await grant(doc.id, { ...command, amount: 30 }, 'otorgar-doble')).toEqual(first);
    const rows = await sql<Array<{ n: number; total: string }>>(
      `SELECT COUNT(*)::int AS n, SUM(amount)::text AS total FROM billing_courtesies`,
    );
    expect(rows[0]).toEqual({ n: 1, total: '30.00' });
    expect(await detail(doc.id)).toMatchObject({ courtesyAmount: '30.00', pendingAmount: '70.00' });

    await expectCode(
      grant(doc.id, { ...command, amount: '31.00' }, 'otorgar-doble'),
      409,
      BILLING_ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
    );
    await expectCode(
      grant(doc.id, { ...command, note: 'Otra nota' }, 'otorgar-doble'),
      409,
      BILLING_ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
    );
    const other = await insertDocument({
      status: 'EMITIDO',
      periodId: await insertPeriod('2026-12-01', '2026-12-31', '2099-12-14'),
      dueDate: '2099-11-14',
      lines: [{ ...prorrateo, kind: 'PLAN', base: '100.00', total: '100.00' }],
    });
    await expectCode(
      grant(other.id, command, 'otorgar-doble'),
      409,
      BILLING_ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
    );
    await expectCode(grant(doc.id, command, '  '), 422, 'IDEMPOTENCY_KEY_REQUIRED');
    const audits = await sql<Array<{ n: number }>>(
      `SELECT COUNT(*)::int AS n FROM test_courtesy_audit WHERE entity_type = 'BillingCourtesy'`,
    );
    expect(audits[0]?.n).toBe(1);
    expect(emitted).toEqual([]);
  });

  it('Idempotency-Key: el doble envío de anular devuelve la misma anulación; otro cuerpo, 409', async () => {
    const period = await insertPeriod('2026-11-01', '2026-11-30', '2099-11-14');
    const doc = await insertDocument({
      status: 'EMITIDO',
      periodId: period,
      dueDate: '2099-11-14',
      lines: [{ ...prorrateo, kind: 'PLAN', base: '100.00', total: '100.00' }],
    });
    const created = await grant(doc.id, {
      target: 'VALOR',
      amount: '100.00',
      reasonCode: 'PROMOCION_COMERCIAL',
    });
    const command = { reasonCode: 'ERROR_DE_REGISTRO' as const, note: 'Duplicada' };
    const voidWith = (key: string, body: typeof command | { reasonCode: 'VALOR_INCORRECTO' }) =>
      inTenant(() => courtesies.void(created.id, body, actorId, key));
    const [first, second] = await Promise.all([
      voidWith('anular-doble', command),
      voidWith('anular-doble', command),
    ]);
    expect(second).toEqual(first);
    expect(first).toMatchObject({ status: 'ANULADA', voidNote: 'Duplicada' });
    expect(await voidWith('anular-doble', command)).toEqual(first);
    await expectCode(
      voidWith('anular-doble', { reasonCode: 'VALOR_INCORRECTO' }),
      409,
      BILLING_ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
    );
    // Otra clave sobre una cortesía ya anulada sigue siendo «ya anulada».
    await expectCode(
      voidWith('anular-otra', command),
      409,
      BILLING_ERROR_CODES.BILLING_COURTESY_ALREADY_VOIDED,
    );
    // La clave de anular ya usada no sirve para anular otra cortesía.
    const another = await grant(doc.id, {
      target: 'VALOR',
      amount: '10.00',
      reasonCode: 'PROMOCION_COMERCIAL',
    });
    await expectCode(
      inTenant(() => courtesies.void(another.id, command, actorId, 'anular-doble')),
      409,
      BILLING_ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
    );
    // Una sola reapertura y una sola auditoría de anulación.
    expect(emitted).toEqual(['billing.contract-period.paid', 'billing.contract-period.reopened']);
    const audits = await sql<Array<{ n: number }>>(
      `SELECT COUNT(*)::int AS n FROM test_courtesy_audit
        WHERE entity_type = 'BillingCourtesy' AND action = $1`,
      [AuditAction.UPDATE],
    );
    expect(audits[0]?.n).toBe(1);
  });

  it('DATOS_BLOQUEADOS sin permiso: note y voidNote de las cortesías salen en null', async () => {
    const period = await insertPeriod('2026-11-01', '2026-11-30', '2099-11-14');
    const doc = await insertDocument({
      status: 'EMITIDO',
      periodId: period,
      dueDate: '2099-11-14',
      lines: [{ ...prorrateo, kind: 'PLAN', base: '100.00', total: '100.00' }],
    });
    const created = await grant(doc.id, {
      target: 'VALOR',
      amount: '10.00',
      reasonCode: 'OTRO',
      note: 'Nota sintética del titular',
    });
    await inTenant(() =>
      courtesies.void(
        created.id,
        { reasonCode: 'DECISION_REVERTIDA', note: 'Anulación sintética' },
        actorId,
        randomUUID(),
      ),
    );
    await grant(doc.id, { target: 'VALOR', amount: '5.00', reasonCode: 'OTRO', note: 'Otra' });

    // Sin la marca, las notas se leen.
    const open = await detail(doc.id);
    expect(open.courtesies?.map(({ note }) => note).sort()).toEqual([
      'Nota sintética del titular',
      'Otra',
    ]);

    privacyMarks.activeMarks.mockResolvedValue({ [partyId]: ['DATOS_BLOQUEADOS'] });
    const blockedDetail = await detail(doc.id);
    expect(blockedDetail.buyerProtected).toBe(true);
    expect(blockedDetail.courtesies).toHaveLength(2);
    for (const courtesy of blockedDetail.courtesies ?? [])
      expect(courtesy).toMatchObject({ note: null, voidNote: null });
    // El resto de la cortesía sigue visible: motivo, valor y estado.
    expect(blockedDetail.courtesies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'ANULADA', voidReasonCode: 'DECISION_REVERTIDA' }),
      ]),
    );

    const statement = await inTenant(() =>
      payments.statementForSubscriber(subscriberId, actorId, { canSeeBlocked: false }),
    );
    expect(statement.buyerProtected).toBe(true);
    expect(statement.courtesies).toHaveLength(2);
    expect(JSON.stringify(statement)).not.toContain('sintética');
    expect(JSON.stringify(blockedDetail)).not.toContain('sintética');

    // Con permiso (canSeeBlocked) el estado de cuenta sí las muestra.
    const granted = await inTenant(() =>
      payments.statementForSubscriber(subscriberId, actorId, {
        canSeeBlocked: true,
        grantedBy: 'CRM_BLOCKED_DATA_READ',
      }),
    );
    expect(granted.courtesies?.map(({ note }) => note)).toContain('Nota sintética del titular');
  });
});
