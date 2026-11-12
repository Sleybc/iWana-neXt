// Spec 2026-11-11 «MOD05 ↔ MOD14 · Contrato activo sin cobros» contra PostgreSQL real:
// CA-1 proyección `billingNotStarted`, CA-2 primer cobro + puesta al día idempotente,
// CA-3 instalación congelada en contrato heredado, CA-6 datos fiscales congelados y borradores
// desbloqueados, CA-7 vencimiento de un periodo cobrado tarde. Adaptadores CRM reales con los
// tipos del DDL real (028, 029, 155, 188); MOD06 por su puerto.
import { randomUUID } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { dataSourceOptions, runInTenantSchema, TenantContext } from '@iwana/db';
import { CustomerSegment } from '@iwana/shared';
import { createFiscalDocumentCrypto } from '../../../common/crypto/fiscal-document.util';
import { billingPostgresIntegrationEnabled } from '../../../../../../packages/database/src/migrations/tenant/billing-migration.integration-helpers';
import { BillingContractFirstChargeAdapter } from '../../crm/contracts/billing-contract-first-charge.adapter';
import { BillingContractReadAdapter } from '../../crm/contracts/billing-contract-read.adapter';
import { createBillingSchema } from '../billing-postgres.fixture';
import { BillingDocumentsService } from '../documents/billing-documents.service';
import { BillingPaymentsService } from '../payments/billing-payments.service';
import { BillingFirstChargeService } from './billing-first-charge.service';
import { BillingGenerationService } from './billing-generation.service';

const PLAN_ID = '34648e27-4540-4529-a089-3e3b4fb23bd5';
const TODAY = '2026-11-11';
/** Documento sintético del titular (no es PII real). */
const SYNTHETIC_DOCUMENT = '1000000001';
const VAT = {
  treatment: 'STANDARD',
  legalBasis: 'ET-468',
  ratePercent: 19,
  requiresAccountantReview: false,
  resolvedAt: '2026-10-01T00:00:00Z',
};

const describeDb = billingPostgresIntegrationEnabled ? describe : describe.skip;
describeDb('Contrato activo sin cobros — primer cobro (PostgreSQL real)', () => {
  let ds: DataSource;
  let schemaName: string;
  let tenantId: string;
  let service: BillingFirstChargeService;
  let payments: BillingPaymentsService;
  const actorId = randomUUID();
  const settings = {
    getSnapshot: jest.fn().mockResolvedValue({ timezone: 'America/Bogota' }),
  };
  const audit = { logWithin: jest.fn().mockResolvedValue(undefined) };
  const privacy = { activeMarks: jest.fn().mockResolvedValue({}) };
  // Puerto de MOD06: cargo vigente 50.000 para el plan en RESIDENTIAL; sin precio en otro segmento.
  const catalog = {
    createSnapshot: jest.fn(
      async (_tenant: string, _schema: string, planId: string, segment?: CustomerSegment) => {
        if (planId !== PLAN_ID || (segment ?? CustomerSegment.RESIDENTIAL) !== 'RESIDENTIAL') {
          throw new NotFoundException('sin precio vigente');
        }
        return { planId, installationFee: 50000, monthlyPrice: 100000 };
      },
    ),
    // MOD14 R2: el plan no trae tratamiento propio de instalación → STANDARD 19 % (D2).
    getItemVatTreatments: jest.fn().mockResolvedValue([]),
  };
  const config = new ConfigService({
    PII_ENCRYPTION_KEY: '56'.repeat(32),
    MFA_ENCRYPTION_KEY: '56'.repeat(32),
    // Explícita: el CI no define PII_HASH_KEY y ConfigService caería a process.env.
    PII_HASH_KEY: '57'.repeat(32),
    NODE_ENV: 'test',
  });
  const fiscalCrypto = createFiscalDocumentCrypto(config);
  let generation: BillingGenerationService;
  const run = <T>(fn: () => Promise<T>) =>
    TenantContext.run({ tenantId, schemaName, tenantSlug: 'first-charge-it' }, fn);
  const sql = <T = Record<string, unknown>>(query: string, args: unknown[] = []) =>
    runInTenantSchema(ds, schemaName, (qr) => qr.query(query, args) as Promise<T[]>);

  async function seedSubscriber(): Promise<string> {
    const id = randomUUID();
    await sql(
      `INSERT INTO subscribers (id,tenant_id,party_id,person_type,document_type,business_name,customer_segment)
       VALUES ($1,$2,$3,'JURIDICA','NIT','Titular sintético','RESIDENTIAL')`,
      [id, tenantId, randomUUID()],
    );
    return id;
  }

  /** Titular natural como el de fe648c40: documento solo cifrado en el suscriptor. */
  async function seedNaturalSubscriber(): Promise<string> {
    const id = randomUUID();
    const document = fiscalCrypto.encrypt(SYNTHETIC_DOCUMENT)!;
    await sql(
      `INSERT INTO subscribers (id,tenant_id,party_id,person_type,document_type,first_name,last_name,
                                address,document_number_encrypted,document_number_hmac,customer_segment)
       VALUES ($1,$2,$3,'NATURAL','CC','Nombre','Sintético','Calle sintética 1 # 2-3',$4,$5,
               'RESIDENTIAL')`,
      [id, tenantId, randomUUID(), document.encrypted, document.hmac],
    );
    return id;
  }

  async function seedContract(input: {
    subscriberId?: string;
    status?: string;
    fee?: string | null;
    planId?: string;
    startDate?: string | null;
    statusChangedAt?: string | null;
    eventStart?: string;
    cycleDay?: number;
    /** `null` reproduce el contrato heredado sin documento fiscal congelado. */
    fiscalDocument?: string | null;
  }): Promise<{ contractId: string; subscriberId: string }> {
    const subscriberId = input.subscriberId ?? (await seedSubscriber());
    const contractId = randomUUID();
    await sql(
      `INSERT INTO contracts (id,tenant_id,subscriber_id,status,billing_cycle_day,start_date,
                              status_changed_at,plan_id,plan_snapshot_json,vat_snapshot,
                              fiscal_document,installation_fee,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6::date,$7::timestamptz,$8,$9::jsonb,$10::jsonb,$12,$11,
               '2026-10-30T00:00:00Z')`,
      [
        contractId,
        tenantId,
        subscriberId,
        input.status ?? 'ACTIVE',
        input.cycleDay ?? 1,
        input.startDate ?? null,
        input.statusChangedAt === undefined ? '2026-10-30T23:49:05Z' : input.statusChangedAt,
        input.planId ?? PLAN_ID,
        JSON.stringify({ name: 'Plan sintético', monthlyPrice: '100000.00' }),
        JSON.stringify(VAT),
        input.fee === undefined ? null : input.fee,
        input.fiscalDocument === undefined ? '900000001' : input.fiscalDocument,
      ],
    );
    if (input.eventStart) {
      await sql(
        `INSERT INTO contract_activation_events (id,tenant_id,contract_id,source,envelope,occurred_at)
         VALUES ($1,$2,$3,'SIGNATURE',$4::jsonb,now())`,
        [
          randomUUID(),
          tenantId,
          contractId,
          JSON.stringify({ payload: { billingStartDate: input.eventStart } }),
        ],
      );
    }
    return { contractId, subscriberId };
  }

  const firstCharge = (contractId: string) =>
    run(() => service.generateFirstCharge({ contractId, actorId, date: TODAY }));
  const lines = (contractId: string) =>
    sql<{ period_start: string; covered_start: string; kind: string; base_amount: string }>(
      `SELECT p.period_start::text, p.covered_start::text, l.kind, l.base_amount::text
         FROM billing_document_lines l
         JOIN billing_documents d ON d.id = l.document_id
         JOIN billing_periods p ON p.id = d.period_id
        WHERE d.contract_id = $1
        ORDER BY p.period_start, l.position`,
      [contractId],
    );
  const counts = async (contractId: string) => {
    const [row] = await sql<{ periods: number; documents: number }>(
      `SELECT (SELECT count(*)::int FROM billing_periods WHERE contract_id = $1) AS periods,
              (SELECT count(*)::int FROM billing_documents WHERE contract_id = $1) AS documents`,
      [contractId],
    );
    return row!;
  };
  const contractRow = async (contractId: string) => {
    const [row] = await sql<{ installation_fee: string | null; updated_at: Date }>(
      'SELECT installation_fee::text, updated_at FROM contracts WHERE id = $1',
      [contractId],
    );
    return row!;
  };

  beforeAll(async () => {
    ds = new DataSource({
      ...dataSourceOptions,
      entities: [],
      migrations: [],
      logging: false,
      extra: { max: 5, connectionTimeoutMillis: 3000 },
    });
    await ds.initialize();
    const fixture = await createBillingSchema(ds);
    schemaName = fixture.schemaName;
    tenantId = fixture.tenantId;
    // Columnas y outbox reales de CRM que el fixture mínimo de Billing no trae (028, 188).
    await sql(`
      -- Tipos reales: el suscriptor usa el enum y el contrato varchar (COALESCE exige el cast).
      CREATE TYPE customer_segment_enum AS ENUM ('RESIDENTIAL', 'SOHO', 'PYME', 'CORPORATE', 'GOVERNMENT', 'WHOLESALE');
      ALTER TABLE subscribers ADD COLUMN customer_segment customer_segment_enum NULL;
      ALTER TABLE subscribers
        ADD COLUMN document_number_encrypted varchar(500) NULL,
        ADD COLUMN document_number_hmac varchar(64) NULL,
        ADD COLUMN nit varchar(500) NULL;
      ALTER TABLE contracts
        ADD COLUMN plan_id varchar(120) NOT NULL DEFAULT 'plan-heredado',
        ADD COLUMN IF NOT EXISTS customer_segment varchar(20) NULL, -- el fixture ya la trae (202)
        ADD COLUMN status_changed_at timestamptz NULL,
        ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
        ADD COLUMN fiscal_document_hmac varchar(64) NULL;
      CREATE TABLE contract_activation_events (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        contract_id uuid NOT NULL REFERENCES contracts (id),
        source varchar(16) NOT NULL,
        envelope jsonb NOT NULL,
        occurred_at timestamptz NOT NULL,
        published_at timestamptz NULL,
        CONSTRAINT uq_cae_contract UNIQUE (tenant_id, contract_id)
      );
    `);
    // Política del tenant iwana en desarrollo: ANTICIPADO, día 0, SEPARADO, borrador, lote
    // apagado, corte fijo del ciclo (día 1 → corte 15) con 14 días de plazo y 0 de gracia.
    await sql(
      `UPDATE billing_policy
          SET period_timing='ANTICIPADO', generation_lead_days=0, first_period_mode='SEPARADO',
              approval_mode='BORRADOR', proration_method='DIAS_REALES',
              cutoff_mode='DIA_FIJO_CICLO', payment_term_days=14, grace_days=0,
              cutoff_enabled=true, automatic_generation=false`,
    );
    const reader = new BillingContractReadAdapter(ds, config, settings as never);
    const firstChargePort = new BillingContractFirstChargeAdapter(
      ds,
      settings as never,
      catalog as never,
      audit as never,
      config,
    );
    payments = new BillingPaymentsService(
      ds,
      reader,
      audit as never,
      new EventEmitter2(),
      privacy as never,
      settings as never,
    );
    const documents = new BillingDocumentsService(
      ds,
      audit as never,
      reader,
      { getIssuerIdentity: jest.fn() } as never,
      config,
      { getEffectivePermissionsForUser: jest.fn().mockResolvedValue([]) } as never,
      settings as never,
      privacy as never,
      payments,
    );
    generation = new BillingGenerationService(
      ds,
      reader,
      settings as never,
      documents,
      audit as never,
      privacy as never,
    );
    service = new BillingFirstChargeService(
      ds,
      reader,
      firstChargePort,
      generation,
      settings as never,
      audit as never,
    );
  });

  afterAll(async () => {
    if (ds?.isInitialized) {
      await ds.query(`DROP SCHEMA "${schemaName}" CASCADE`);
      await ds.query('DELETE FROM public.tenants WHERE id=$1', [tenantId]);
      await ds.destroy();
    }
  });

  beforeEach(() => {
    audit.logWithin.mockClear();
    catalog.createSnapshot.mockClear();
  });

  it('CA-1 el estado de cuenta marca los contratos ACTIVE sin documentos emitidos (R1 ampliada)', async () => {
    const subscriberId = await seedSubscriber();
    const { contractId: withoutCharges } = await seedContract({ subscriberId, fee: '0.00' });
    const { contractId: withCharges } = await seedContract({ subscriberId, fee: '0.00' });
    const { contractId: suspended } = await seedContract({ subscriberId, status: 'SUSPENDED' });
    await firstCharge(withCharges);
    // Emitido: deja de estar «sin cobros» (la emisión real la cubre billing-documents).
    await sql(
      `UPDATE billing_documents SET status = 'EMITIDO' WHERE contract_id = '${withCharges}'`,
    );

    const statement = await run(() => payments.statementForSubscriber(subscriberId));
    const flagged = statement.contractSummaries.filter((entry) => entry.billingNotStarted);
    expect(flagged).toEqual([
      {
        contractId: withoutCharges,
        totalInvoiced: '0.00',
        totalPaid: '0.00',
        // Cortesías (spec MOD14 2026-11-12 bloque D): el resumen suma sus ajustes.
        totalCourtesy: '0.00',
        totalPending: '0.00',
        periodState: 'SIN_DOCUMENTO',
        billingNotStarted: true,
      },
    ]);
    expect(flagged.map(({ contractId }) => contractId)).not.toContain(suspended);

    // Solo borradores: la cartera sigue en cero, así que el aviso se mantiene.
    await firstCharge(withoutCharges);
    const drafts = await run(() => payments.statementForSubscriber(subscriberId));
    expect(
      drafts.contractSummaries
        .filter((entry) => entry.billingNotStarted)
        .map(({ contractId }) => contractId),
    ).toEqual([withoutCharges]);

    await sql(
      `UPDATE billing_documents SET status = 'EMITIDO' WHERE contract_id = '${withoutCharges}'`,
    );
    const after = await run(() => payments.statementForSubscriber(subscriberId));
    expect(after.contractSummaries.some((entry) => entry.billingNotStarted)).toBe(false);
  });

  it('CA-2 + CA-3 contrato heredado: congela la instalación, ancla en la activación y se pone al día', async () => {
    const { contractId } = await seedContract({ fee: null });
    const before = await contractRow(contractId);

    const result = await firstCharge(contractId);

    expect(result).toEqual({
      contractId,
      anchorDate: '2026-10-30',
      anchorSource: 'STATUS_CHANGED_AT',
      installationFee: { outcome: 'FROZEN', amount: '50000.00' },
      fiscalData: { outcome: 'FROZEN', frozenFields: ['NAME'], missingFields: ['ADDRESS'] },
      summary: expect.objectContaining({ generated: 2, failed: 0, existing: 0, blocked: 0 }),
      regularizedDrafts: { unblocked: 0, rescheduled: 0 },
    });
    expect(
      (await lines(contractId)).map(({ period_start, covered_start, kind }) => [
        period_start,
        covered_start,
        kind,
      ]),
    ).toEqual([
      // Periodo de la activación prorrateado (30 y 31 de octubre) con la instalación (R5).
      ['2026-10-01', '2026-10-30', 'PRORRATEO'],
      ['2026-10-01', '2026-10-30', 'INSTALACION'],
      ['2026-11-01', '2026-11-01', 'PLAN'],
    ]);
    const install = (await lines(contractId)).find(({ kind }) => kind === 'INSTALACION');
    expect(install?.base_amount).toBe('50000.00');

    const after = await contractRow(contractId);
    expect(after.installation_fee).toBe('50000.00');
    // MOD14 R2: el IVA de la instalación se congela junto con el cargo del contrato heredado.
    const [frozenVat] = await sql<{ installation_vat_snapshot: Record<string, unknown> }>(
      'SELECT installation_vat_snapshot FROM contracts WHERE id = $1',
      [contractId],
    );
    expect(frozenVat?.installation_vat_snapshot).toMatchObject({
      treatment: 'STANDARD',
      legalBasis: 'ET_468',
      ratePercent: 19,
      source: 'DEFAULT',
    });
    expect(after.updated_at.getTime()).toBeGreaterThan(before.updated_at.getTime());
    expect(catalog.createSnapshot).toHaveBeenCalledWith(
      tenantId,
      schemaName,
      PLAN_ID,
      'RESIDENTIAL',
      expect.objectContaining({ manager: expect.anything() }),
    );
    expect(audit.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'Contract',
        entityId: contractId,
        userId: actorId,
        oldValue: { installationFee: null },
        newValue: { installationFee: '50000.00', reason: 'PRIMER_COBRO_CONTRATO_HEREDADO' },
      }),
      expect.anything(),
    );
    expect(audit.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'BillingFirstCharge', entityId: contractId }),
      expect.anything(),
    );
  });

  it('CA-2 idempotencia: repetir (en serie y en paralelo) no duplica periodos ni instalación', async () => {
    const { contractId } = await seedContract({ fee: null });
    const [a, b] = await Promise.all([firstCharge(contractId), firstCharge(contractId)]);
    expect(a.summary.generated + b.summary.generated).toBe(2);
    const once = await counts(contractId);
    expect(once).toEqual({ periods: 2, documents: 2 });

    const again = await firstCharge(contractId);
    expect(again).toMatchObject({
      anchorDate: null,
      anchorSource: null,
      // R4 vuelve a evaluarse con todo en BORRADOR, pero el valor ya congelado no cambia.
      installationFee: { outcome: 'ALREADY_SET', amount: '50000.00' },
      summary: expect.objectContaining({ generated: 0, existing: 1, failed: 0 }),
      regularizedDrafts: { unblocked: 0, rescheduled: 0 },
    });
    expect(await counts(contractId)).toEqual(once);
    expect((await lines(contractId)).filter(({ kind }) => kind === 'INSTALACION')).toHaveLength(1);
  });

  it('CA-2 varios periodos vencidos: genera todos hasta el vigente desde start_date', async () => {
    const { contractId } = await seedContract({ fee: '0.00', startDate: '2026-08-15' });

    const result = await firstCharge(contractId);

    expect(result).toMatchObject({
      anchorDate: '2026-08-15',
      anchorSource: 'START_DATE',
      installationFee: { outcome: 'ALREADY_SET', amount: '0.00' },
      summary: expect.objectContaining({ generated: 4, failed: 0 }),
    });
    const periods = await sql<{ period_start: string; covered_start: string }>(
      `SELECT period_start::text, covered_start::text FROM billing_periods
        WHERE contract_id = $1 ORDER BY period_start`,
      [contractId],
    );
    expect(periods).toEqual([
      { period_start: '2026-08-01', covered_start: '2026-08-15' },
      { period_start: '2026-09-01', covered_start: '2026-09-01' },
      { period_start: '2026-10-01', covered_start: '2026-10-01' },
      { period_start: '2026-11-01', covered_start: '2026-11-01' },
    ]);
    // `0` congelado no se toca y no agrega línea de instalación.
    expect((await lines(contractId)).some(({ kind }) => kind === 'INSTALACION')).toBe(false);
    expect((await contractRow(contractId)).installation_fee).toBe('0.00');
  });

  it('el evento de activación prevalece sobre start_date y status_changed_at', async () => {
    const { contractId } = await seedContract({
      fee: '0.00',
      startDate: '2026-09-01',
      eventStart: '2026-10-20',
    });

    const result = await firstCharge(contractId);

    expect(result).toMatchObject({ anchorDate: '2026-10-20', anchorSource: 'ACTIVATION_EVENT' });
    expect(result.summary.generated).toBe(2);
  });

  it('CA-3 plan heredado sin precio vigente: no congela y genera sin instalación', async () => {
    const { contractId } = await seedContract({ fee: null, planId: 'plan-heredado' });

    const result = await firstCharge(contractId);

    expect(result.installationFee).toEqual({ outcome: 'UNRESOLVED', amount: null });
    expect(catalog.createSnapshot).not.toHaveBeenCalled();
    expect((await contractRow(contractId)).installation_fee).toBeNull();
    expect((await lines(contractId)).some(({ kind }) => kind === 'INSTALACION')).toBe(false);
  });

  it('rechaza contratos no activos (409) e inexistentes (404) sin generar nada', async () => {
    const { contractId } = await seedContract({ status: 'SUSPENDED', fee: null });

    await expect(firstCharge(contractId)).rejects.toBeInstanceOf(ConflictException);
    await expect(firstCharge(randomUUID())).rejects.toBeInstanceOf(NotFoundException);
    expect(await counts(contractId)).toEqual({ periods: 0, documents: 0 });
    expect((await contractRow(contractId)).installation_fee).toBeNull();
  });

  /** Estado previo a R7/R8 de fe648c40: borradores bloqueados y octubre vencido el 14-oct. */
  async function seedLegacyDrafts(): Promise<{ contractId: string; subscriberId: string }> {
    const subscriberId = await seedNaturalSubscriber();
    const seeded = await seedContract({ subscriberId, fee: null, fiscalDocument: null });
    await run(() =>
      generation.generate({
        contractId: seeded.contractId,
        date: TODAY,
        firstChargeFrom: '2026-10-30',
        actorId: null,
      }),
    );
    await run(() =>
      generation.generate({
        contractId: seeded.contractId,
        date: TODAY,
        targetPeriodStart: '2026-11-01',
        actorId: null,
      }),
    );
    await sql(
      `UPDATE billing_periods SET due_date = '2026-10-14', cutoff_date = '2026-10-15'
        WHERE contract_id = $1 AND period_start = '2026-10-01'`,
      [seeded.contractId],
    );
    await sql(
      `UPDATE billing_documents d SET due_date = '2026-10-14'
         FROM billing_periods p
        WHERE p.id = d.period_id AND d.contract_id = $1 AND p.period_start = '2026-10-01'`,
      [seeded.contractId],
    );
    return seeded;
  }

  const draftState = (contractId: string) =>
    sql<{
      period_start: string;
      status: string;
      blocking_reason: string | null;
      document_due: string;
      period_due: string;
      period_cutoff: string | null;
    }>(
      `SELECT p.period_start::text, d.status, d.blocking_reason, d.due_date::text AS document_due,
              p.due_date::text AS period_due, p.cutoff_date::text AS period_cutoff
         FROM billing_documents d JOIN billing_periods p ON p.id = d.period_id
        WHERE d.contract_id = $1 ORDER BY p.period_start`,
      [contractId],
    );

  it('CA-6 + CA-7 contrato heredado sin datos fiscales: congela, desbloquea y corrige el vencimiento', async () => {
    const { contractId } = await seedLegacyDrafts();
    expect(await draftState(contractId)).toEqual([
      expect.objectContaining({
        period_start: '2026-10-01',
        blocking_reason: 'SIN_DATOS_FISCALES',
        document_due: '2026-10-14',
      }),
      expect.objectContaining({
        period_start: '2026-11-01',
        blocking_reason: 'SIN_DATOS_FISCALES',
        document_due: '2026-11-14',
      }),
    ]);

    const result = await firstCharge(contractId);

    expect(result).toMatchObject({
      anchorDate: null,
      installationFee: { outcome: 'FROZEN', amount: '50000.00' },
      fiscalData: {
        outcome: 'FROZEN',
        frozenFields: ['NAME', 'DOCUMENT', 'ADDRESS'],
        missingFields: [],
      },
      summary: expect.objectContaining({ generated: 0, existing: 1, failed: 0 }),
      regularizedDrafts: { unblocked: 2, rescheduled: 1 },
    });
    expect(await draftState(contractId)).toEqual([
      {
        period_start: '2026-10-01',
        status: 'BORRADOR',
        blocking_reason: null,
        document_due: '2026-11-25',
        period_due: '2026-11-25',
        period_cutoff: '2026-11-26',
      },
      {
        period_start: '2026-11-01',
        status: 'BORRADOR',
        blocking_reason: null,
        document_due: '2026-11-14',
        period_due: '2026-11-14',
        period_cutoff: '2026-11-15',
      },
    ]);
    const [contract] = await sql<{
      fiscal_name: string;
      fiscal_address: string;
      fiscal_document: string | null;
      fiscal_document_encrypted: string;
      fiscal_document_hmac: string;
    }>(
      `SELECT fiscal_name, fiscal_address, fiscal_document, fiscal_document_encrypted,
              fiscal_document_hmac
         FROM contracts WHERE id = $1`,
      [contractId],
    );
    expect(contract).toMatchObject({
      fiscal_name: 'Nombre Sintético',
      fiscal_address: 'Calle sintética 1 # 2-3',
      fiscal_document: null,
      fiscal_document_hmac: fiscalCrypto.encrypt(SYNTHETIC_DOCUMENT)!.hmac,
    });
    expect(contract!.fiscal_document_encrypted).not.toContain(SYNTHETIC_DOCUMENT);
    expect(fiscalCrypto.decrypt(contract!.fiscal_document_encrypted)).toBe(SYNTHETIC_DOCUMENT);
    // Auditoría sin PII: el contrato registra solo nombres de campo y cada borrador su cambio.
    const entries = audit.logWithin.mock.calls.map(([entry]) => entry as Record<string, unknown>);
    expect(JSON.stringify(entries)).not.toContain(SYNTHETIC_DOCUMENT);
    expect(JSON.stringify(entries)).not.toContain('Calle sintética');
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: 'Contract',
          newValue: expect.objectContaining({
            fiscalFieldsFrozen: ['NAME', 'DOCUMENT', 'ADDRESS'],
            reason: 'PRIMER_COBRO_CONTRATO_HEREDADO',
          }),
        }),
        expect.objectContaining({
          entityType: 'BillingDocument',
          oldValue: { blockingReason: 'SIN_DATOS_FISCALES', dueDate: '2026-10-14' },
          newValue: {
            blockingReason: null,
            dueDate: '2026-11-25',
            reason: 'PRIMER_COBRO_CONTRATO_HEREDADO',
          },
        }),
      ]),
    );

    // Idempotente: repetir no cambia nada.
    const again = await firstCharge(contractId);
    expect(again).toMatchObject({
      fiscalData: { outcome: 'ALREADY_SET', frozenFields: [], missingFields: [] },
      regularizedDrafts: { unblocked: 0, rescheduled: 0 },
    });
    expect(await counts(contractId)).toEqual({ periods: 2, documents: 2 });
  });

  it('CA-7 primer cobro tarde: octubre generado el 11-nov vence el 25-nov y el corte el 26-nov', async () => {
    const subscriberId = await seedNaturalSubscriber();
    const { contractId } = await seedContract({ subscriberId, fee: null, fiscalDocument: null });

    const result = await firstCharge(contractId);

    expect(result).toMatchObject({
      anchorDate: '2026-10-30',
      fiscalData: { outcome: 'FROZEN', frozenFields: ['NAME', 'DOCUMENT', 'ADDRESS'] },
      summary: expect.objectContaining({ generated: 2, blocked: 0 }),
      regularizedDrafts: { unblocked: 0, rescheduled: 0 },
    });
    expect(await draftState(contractId)).toEqual([
      {
        period_start: '2026-10-01',
        status: 'BORRADOR',
        blocking_reason: null,
        document_due: '2026-11-25',
        period_due: '2026-11-25',
        period_cutoff: '2026-11-26',
      },
      // Noviembre vence en su fecha del ciclo: no es posterior a la generación.
      {
        period_start: '2026-11-01',
        status: 'BORRADOR',
        blocking_reason: null,
        document_due: '2026-11-14',
        period_due: '2026-11-14',
        period_cutoff: '2026-11-15',
      },
    ]);
  });

  it('R7/R8 no tocan documentos emitidos ni congelan si algo ya salió de BORRADOR', async () => {
    const { contractId } = await seedLegacyDrafts();
    // Octubre ya emitido (vencido el 14-oct); noviembre sigue en borrador bloqueado.
    await sql(
      `UPDATE billing_documents d SET status = 'EMITIDO', number = 'DC-T-' || left(d.id::text, 8),
              issue_date = '2026-11-11', blocking_reason = NULL
         FROM billing_periods p
        WHERE p.id = d.period_id AND d.contract_id = $1 AND p.period_start = '2026-10-01'`,
      [contractId],
    );

    const result = await firstCharge(contractId);

    expect(result).toMatchObject({
      installationFee: { outcome: 'NOT_APPLICABLE', amount: null },
      fiscalData: { outcome: 'NOT_APPLICABLE', frozenFields: [], missingFields: [] },
      regularizedDrafts: { unblocked: 0, rescheduled: 0 },
    });
    expect(await draftState(contractId)).toEqual([
      expect.objectContaining({
        period_start: '2026-10-01',
        status: 'EMITIDO',
        document_due: '2026-10-14',
        period_due: '2026-10-14',
        period_cutoff: '2026-10-15',
      }),
      expect.objectContaining({
        period_start: '2026-11-01',
        status: 'BORRADOR',
        blocking_reason: 'SIN_DATOS_FISCALES',
      }),
    ]);
    expect((await contractRow(contractId)).installation_fee).toBeNull();
  });
});
