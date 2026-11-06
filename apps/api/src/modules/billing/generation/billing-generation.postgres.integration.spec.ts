import { BillingPaymentsService } from '../payments/billing-payments.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createBillingSchema } from '../billing-postgres.fixture';
import { dropBillingTenantFixture } from '../../../../../../packages/database/src/migrations/tenant/billing-migration.integration-helpers';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { dataSourceOptions, runInTenantSchema, TenantContext } from '@iwana/db';
import { decryptAes256Gcm, parseEncryptionKeyHex } from '../../../common/crypto/aes-gcm.util';
import { AuditService } from '../../audit/audit.service';
import { IPrivacyMarksReadPort } from '../../privacy/ports/privacy-marks-read.port';
import { SettingsPriorityTenantReadPort } from '../../tenant/ports/settings-priority-tenant-read.port';
import {
  BillingContractReadPort,
  type BillableContract,
} from '../ports/billing-contract-read.port';
import { BillingIssuerReadPort } from '../ports/billing-issuer-read.port';
import { BillingDocumentsService } from '../documents/billing-documents.service';
import { BillingGenerationService } from './billing-generation.service';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const databaseName = dataSourceOptions.database;
const safeDatabaseName =
  typeof databaseName === 'string' && /^(test|iwana_it_[a-z0-9_]+)$/u.test(databaseName);
const describeWithDb = dbAvailable && safeDatabaseName ? describe : describe.skip;

describeWithDb('BillingGenerationService y BillingDocumentsService contra PostgreSQL real', () => {
  let dataSource: DataSource;
  let generation: BillingGenerationService;
  let documents: BillingDocumentsService;
  let tenantId: string;
  let schemaName: string;
  let billingFixture: Awaited<ReturnType<typeof createBillingSchema>> | undefined;
  let actorId: string;
  let candidates: BillableContract[];
  let contractRead: jest.Mocked<
    Pick<
      BillingContractReadPort,
      | 'findBillableForDate'
      | 'findByContractId'
      | 'findBillingCycleByContractId'
      | 'findTitularRefs'
      | 'lockTitularForBillingWrite'
    >
  >;
  const piiKey = Buffer.from(
    '4ef6bb844c9e858d2a93b5585599d419f79148fc24b5d9b0e03f5a53fa146d27',
    'hex',
  );

  const tenantContext = () => ({ tenantId, schemaName, tenantSlug: 'billing-generation-it' });

  function candidate(index: number, overrides: Partial<BillableContract> = {}): BillableContract {
    const contractId = randomUUID();
    const subscriberId = randomUUID();
    return {
      contractId,
      subscriberId,
      partyId: null,
      status: 'ACTIVE',
      statusReasonCode: null,
      terminatedAt: null,
      cycleDay: 5,
      cutoffDay: 20,
      activatedAt: '2026-10-05',
      endDate: null,
      planName: `Plan ${index}`,
      monthlyPrice: '31000.00',
      vatSnapshot: {
        treatment: 'STANDARD',
        legalBasis: 'ET-468',
        ratePercent: 19,
        requiresAccountantReview: false,
        resolvedAt: '2026-10-01T00:00:00.000Z',
      },
      unbilledAdditionalCount: index === 0 ? 2 : 0,
      buyer: {
        displayName: `Adquirente ${index}`,
        documentType: 'NIT',
        documentNumber: `900000${String(index).padStart(3, '0')}`,
        hasDocumentNumber: true,
        address: 'Dirección de prueba',
        rutResponsibilities: [],
      },
      ...overrides,
    };
  }

  async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return runInTenantSchema(dataSource, schemaName, (qr) => qr.query(sql, params) as Promise<T[]>);
  }

  async function seedSchema(): Promise<void> {
    await runInTenantSchema(dataSource, schemaName, async (qr) => {
      await qr.query(
        `UPDATE billing_policy SET period_timing='VENCIDO', cutoff_mode='VENCIMIENTO_MAS_GRACIA', payment_term_days=9, grace_days=2, generation_hour=2 WHERE tenant_id=$1`,
        [tenantId],
      );
    });
  }

  beforeAll(async () => {
    tenantId = randomUUID();
    schemaName = `tenant_billing_generation_it_${randomUUID().replace(/-/gu, '')}`;
    actorId = randomUUID();
    candidates = [
      ...Array.from({ length: 19 }, (_, index) => candidate(index)),
      candidate(19, { status: 'TERMINATED', terminatedAt: '2026-11-02' }),
      candidate(20, { monthlyPrice: null }),
      candidate(21, { vatSnapshot: null }),
    ];
    dataSource = new DataSource({
      ...dataSourceOptions,
      entities: [],
      migrations: [],
      logging: false,
      extra: { ...dataSourceOptions.extra, max: 10, min: 1 },
    });
    await dataSource.initialize();
    const fixture = await createBillingSchema(dataSource);
    billingFixture = fixture;
    schemaName = fixture.schemaName;
    tenantId = fixture.tenantId;
    await seedSchema();
    for (const c of candidates) {
      await rows(
        `INSERT INTO subscribers (id, tenant_id, party_id, person_type, document_type, business_name, rut_responsibilities) VALUES ($1,$2,$3,'JURIDICA',$4,$5,$6)`,
        [
          c.subscriberId,
          tenantId,
          c.partyId,
          c.buyer.documentType,
          c.buyer.displayName,
          c.buyer.rutResponsibilities,
        ],
      );
      await rows(
        `INSERT INTO contracts (id,tenant_id,subscriber_id,status,status_reason_code,terminated_at,billing_cycle_day,start_date,plan_snapshot_json,vat_snapshot,fiscal_document,additional_product_ids) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12::jsonb)`,
        [
          c.contractId,
          tenantId,
          c.subscriberId,
          c.status,
          c.statusReasonCode,
          c.terminatedAt ? c.terminatedAt + 'T12:00:00-05:00' : null,
          c.cycleDay,
          c.activatedAt,
          JSON.stringify({ name: c.planName, monthlyPrice: c.monthlyPrice }),
          JSON.stringify(c.vatSnapshot),
          c.buyer.documentNumber,
          JSON.stringify(Array.from({ length: c.unbilledAdditionalCount }, () => randomUUID())),
        ],
      );
    }

    contractRead = {
      findBillableForDate: jest.fn(
        async (localDate: string, page: { afterContractId?: string; limit: number }) => {
          void localDate;
          void page;
          return candidates;
        },
      ),
      findByContractId: jest.fn(
        async (id: string) => candidates.find(({ contractId }) => contractId === id) ?? null,
      ),
      findBillingCycleByContractId: jest.fn(async (id: string) => {
        const value = candidates.find(({ contractId }) => contractId === id);
        return value ? { cycleDay: value.cycleDay, cutoffDay: value.cutoffDay } : null;
      }),
      lockTitularForBillingWrite: jest
        .fn<
          BillingContractReadPort['lockTitularForBillingWrite'] extends (
            ...args: infer A
          ) => infer R
            ? R
            : never,
          Parameters<BillingContractReadPort['lockTitularForBillingWrite']>
        >()
        .mockResolvedValue({ exists: true, anonymized: false, partyId: null }),
      findTitularRefs: jest.fn(async (ids: string[]) =>
        ids.flatMap((subscriberId) =>
          candidates.some((value) => value.subscriberId === subscriberId)
            ? [{ subscriberId, partyId: null, anonymized: false }]
            : [],
        ),
      ),
    };
    const tenantSettings = {
      getSnapshot: jest.fn(async () => ({
        timezone: 'America/Bogota',
        mfaRequiredAll: false,
        brandingCustomized: false,
      })),
    };
    const audit = { logWithin: jest.fn(async () => undefined) };
    const privacyMarks = { activeMarks: jest.fn(async () => ({})) };
    const issuer = {
      getIssuerIdentity: jest.fn(async () => ({
        legalName: 'Operador de prueba',
        nit: '900123456',
        verificationDigit: '7',
      })),
    };
    const config = new ConfigService({
      NODE_ENV: 'test',
      MFA_ENCRYPTION_KEY: piiKey.toString('hex'),
      PII_ENCRYPTION_KEY: piiKey.toString('hex'),
    });
    const permissions = { getEffectivePermissionsForUser: jest.fn(async () => []) };
    documents = new BillingDocumentsService(
      dataSource,
      audit as never,
      contractRead as never,
      issuer as never,
      config,
      permissions as never,
      tenantSettings as never,
      privacyMarks as never,
      new BillingPaymentsService(
        dataSource,
        contractRead as never,
        audit as never,
        new EventEmitter2(),
        privacyMarks as never,
        tenantSettings as never,
      ),
    );
    generation = new BillingGenerationService(
      dataSource,
      contractRead as never,
      tenantSettings as never,
      documents,
      audit as never,
      privacyMarks as never,
    );
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dropBillingTenantFixture(dataSource, billingFixture);
  });

  it('evita duplicados en doble ejecución y cubre terminado, adicionales sin cobrar y bloqueos de CA-FAC-05', async () => {
    const summaries = await TenantContext.run(tenantContext(), () =>
      Promise.all([
        generation.generate({ date: '2026-11-05', actorId }),
        generation.generate({ date: '2026-11-05', actorId }),
      ]),
    );

    expect(summaries.reduce((total, summary) => total + summary.generated, 0)).toBe(20);
    expect(summaries.reduce((total, summary) => total + summary.existing, 0)).toBe(22);
    expect(summaries.reduce((total, summary) => total + summary.blocked, 0)).toBe(2);
    expect(
      summaries.reduce((total, summary) => total + summary.unbilledAdditionalDocuments, 0),
    ).toBe(1);
    expect(
      await rows<{ count: number }>('SELECT count(*)::int AS count FROM billing_periods'),
    ).toEqual([{ count: 22 }]);
    expect(
      await rows<{ count: number }>('SELECT count(*)::int AS count FROM billing_documents'),
    ).toEqual([{ count: 22 }]);

    const terminated = candidates[19];
    if (!terminated) throw new Error('Falta el contrato de terminación del fixture.');
    const terminationLine = await rows<{ kind: string; base_amount: string }>(
      `SELECT l.kind, l.base_amount
         FROM billing_document_lines l
         JOIN billing_documents d ON d.id = l.document_id
        WHERE d.tenant_id = $1 AND d.contract_id = $2`,
      [tenantId, terminated.contractId],
    );
    expect(terminationLine[0]).toMatchObject({ kind: 'PRORRATEO', base_amount: '29000.00' });

    const blocked = await rows<{ blocking_reason: string }>(
      `SELECT blocking_reason FROM billing_documents WHERE blocking_reason IS NOT NULL ORDER BY blocking_reason`,
    );
    expect(blocked.map(({ blocking_reason }) => blocking_reason)).toEqual([
      'SIN_PRECIO',
      'SIN_TRATAMIENTO_IVA',
    ]);
  });

  it('emite 20 documentos concurrentes sin huecos y conserva solo el cifrado del documento fiscal', async () => {
    await TenantContext.run(tenantContext(), () =>
      generation.generate({ date: '2026-11-05', actorId }),
    );
    const ids = await rows<{ id: string; contract_id: string }>(
      `SELECT id::text, contract_id::text FROM billing_documents
        WHERE tenant_id = $1 AND blocking_reason IS NULL ORDER BY created_at, id LIMIT 20`,
      [tenantId],
    );
    expect(ids).toHaveLength(20);

    const issued = await TenantContext.run(tenantContext(), () =>
      Promise.all(ids.map(({ id }) => documents.issue([id], actorId))),
    );
    expect(issued.flat()).toHaveLength(20);

    const persisted = await rows<{
      number: string;
      buyer_snapshot: Record<string, unknown>;
      buyer_document_encrypted: string;
    }>(
      `SELECT number, buyer_snapshot, buyer_document_encrypted
         FROM billing_documents WHERE tenant_id = $1 AND status = 'EMITIDO'
        ORDER BY number`,
      [tenantId],
    );
    expect(persisted.map(({ number }) => number)).toEqual(
      Array.from({ length: 20 }, (_, index) => `DC-${String(index + 1).padStart(6, '0')}`),
    );
    for (const row of persisted) {
      expect(row.buyer_snapshot).not.toHaveProperty('documentNumber');
      expect(
        decryptAes256Gcm(
          row.buyer_document_encrypted,
          parseEncryptionKeyHex(piiKey.toString('hex')),
        ),
      ).toMatch(/^900000\d{3}$/u);
    }
  });
});
