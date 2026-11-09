import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { dataSourceOptions, runInTenantSchema, TenantContext } from '@iwana/db';
import { SettingsPriorityTenantReadPort } from '../../tenant/ports/settings-priority-tenant-read.port';
import { encryptAes256Gcm } from '../../../common/crypto/aes-gcm.util';
import { BillingContractReadAdapter } from './billing-contract-read.adapter';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../packages/database/src/migrations/tenant/runner';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const databaseName = dataSourceOptions.database;
const safeDatabaseName =
  typeof databaseName === 'string' && /^(test|iwana_it_[a-z0-9_]+)$/u.test(databaseName);
const describeWithDb = dbAvailable && safeDatabaseName ? describe : describe.skip;
if (!safeDatabaseName) {
  console.warn(
    `[billing-integration] describe.skip: DB_NAME=${String(databaseName)}; se requiere test o iwana_it_* .`,
  );
}
const piiKey = Buffer.from(
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  'hex',
);

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/gu, '""')}"`;
}

describeWithDb('BillingContractReadAdapter contra PostgreSQL real', () => {
  let dataSource: DataSource;
  let adapter: BillingContractReadAdapter;
  const tenantId = randomUUID();
  const schemaName = `tenant_billing_it_${randomUUID().replace(/-/gu, '')}`;
  const tenantContext = {
    tenantId,
    schemaName,
    tenantSlug: `billing-it-${tenantId.slice(0, 8)}`,
  };

  const config = new ConfigService({
    PII_ENCRYPTION_KEY: piiKey.toString('hex'),
    MFA_ENCRYPTION_KEY: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
    PII_HASH_KEY: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
  });

  async function insertSubscriber(
    input: {
      id?: string;
      tenantId?: string;
      anonymizedAt?: string | null;
      anonymizedRequestId?: string | null;
    } = {},
  ): Promise<string> {
    const id = input.id ?? randomUUID();
    // Columnas obligatorias del esquema migrado: chk_subscriber_person_fields exige documento
    // cifrado y estrato salvo en filas anonimizadas; address, customer_segment, vat_treatment
    // y created_by son NOT NULL.
    await runInTenantSchema(dataSource, schemaName, (qr) =>
      qr.query(
        `INSERT INTO subscribers (
           id, tenant_id, party_id, person_type, customer_segment, document_type,
           document_number_encrypted, first_name, last_name, stratum, business_name, address,
           vat_treatment, rut_responsibilities, created_by, anonymized_at, anonymized_request_id
         ) VALUES ($1, $2, $3, 'NATURAL', 'RESIDENTIAL', 'CC', 'sintetico-cifrado', 'Titular',
                   'Sintético', 3, NULL, 'Dirección sintética', 'STANDARD', ARRAY[]::text[], $4,
                   $5, $6)`,
        [
          id,
          input.tenantId ?? tenantId,
          randomUUID(),
          randomUUID(),
          input.anonymizedAt ?? null,
          input.anonymizedRequestId ?? null,
        ],
      ),
    );
    return id;
  }

  async function insertContract(input: {
    subscriberId: string;
    id?: string;
    status?: 'ACTIVE' | 'SUSPENDED' | 'TERMINATED' | 'ARCHIVED';
    statusReasonCode?: string | null;
    terminatedAt?: string | null;
    encryptedDocument?: string | null;
    additionalProductIds?: string[];
    additionalServiceIds?: string[];
  }): Promise<string> {
    const id = input.id ?? randomUUID();
    await runInTenantSchema(dataSource, schemaName, (qr) =>
      qr.query(
        `INSERT INTO contracts (
           id, tenant_id, subscriber_id, status, status_reason_code, terminated_at,
           billing_cycle_day, start_date, end_date, plan_id, plan_snapshot_json, vat_snapshot,
           fiscal_name, fiscal_address, fiscal_document, fiscal_document_encrypted,
           additional_product_ids, additional_service_ids
         ) VALUES (
           $1, $2, $3, $4, $5, $6, 15, '2026-01-01', NULL, 'fixture-plan',
           '{"name":"Plan sintético","monthlyPrice":"85000.00"}'::jsonb,
           NULL, NULL, NULL, NULL, $7, $8::jsonb, $9::jsonb
         )`,
        [
          id,
          tenantId,
          input.subscriberId,
          input.status ?? 'ACTIVE',
          input.statusReasonCode ?? null,
          input.terminatedAt ?? null,
          input.encryptedDocument ?? null,
          JSON.stringify(input.additionalProductIds ?? []),
          JSON.stringify(input.additionalServiceIds ?? []),
        ],
      ),
    );
    return id;
  }

  beforeAll(async () => {
    dataSource = new DataSource({
      ...dataSourceOptions,
      entities: [],
      migrations: [],
      logging: false,
      extra: { ...dataSourceOptions.extra, max: 3, min: 1 },
    });
    await dataSource.initialize();
    // La migración 092 exige un tenant canónico en public.tenants para su esquema.
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5)`,
      [
        tenantId,
        'Billing contract read sintético',
        tenantContext.tenantSlug,
        schemaName,
        'billing-contract-read@example.invalid',
      ],
    );
    // El esquema lo crea la cadena de migraciones del tenant: subscribers, contracts y
    // crm_billing_cycles (167 siembra el ciclo 15 con corte 30) con constraints y triggers
    // reales, no un DDL escrito a mano.
    await dataSource.query(`CREATE SCHEMA ${quoteIdentifier(schemaName)}`);
    const tenantDataSource = createTenantDataSource(
      dataSource,
      schemaName,
      tenantContext.tenantSlug,
    );
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }
    adapter = new BillingContractReadAdapter(dataSource, config, {
      getSnapshot: jest.fn().mockResolvedValue({ timezone: 'America/Bogota' }),
    } as unknown as SettingsPriorityTenantReadPort);
  }, 180_000);

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    try {
      await dataSource.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaName)} CASCADE`);
      await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
    } finally {
      await dataSource.destroy();
    }
  });

  it('incluye terminación del periodo anterior, excluye fechas fuera de ventana y titulares anonimizados', async () => {
    const billableSubscriberId = await insertSubscriber();
    const oldTerminationSubscriberId = await insertSubscriber();
    const beforeWindowSubscriberId = await insertSubscriber();
    const anonymizedSubscriberId = await insertSubscriber({
      anonymizedAt: '2026-10-01T00:00:00.000Z',
      anonymizedRequestId: randomUUID(),
    });
    // ck_subscribers_anonymization_marker_pair (150) nace con las columnas y prohíbe la marca
    // parcial: la segunda fila anonimizada lleva el par completo.
    const partialAnonymizedSubscriberId = await insertSubscriber({
      anonymizedAt: '2026-10-01T00:00:00.000Z',
      anonymizedRequestId: randomUUID(),
    });
    const billableId = await insertContract({ subscriberId: billableSubscriberId });
    const previousPeriodTerminatedId = await insertContract({
      subscriberId: oldTerminationSubscriberId,
      status: 'TERMINATED',
      terminatedAt: '2026-11-14T17:00:00-05:00',
      additionalProductIds: ['product-1', 'product-2'],
      additionalServiceIds: ['service-1', 'service-2', 'service-3'],
    });
    const outsideWindowTerminatedId = await insertContract({
      subscriberId: beforeWindowSubscriberId,
      status: 'TERMINATED',
      terminatedAt: '2026-09-18T17:00:00-05:00',
    });
    await insertContract({ subscriberId: anonymizedSubscriberId });
    await insertContract({ subscriberId: partialAnonymizedSubscriberId });

    const result = await TenantContext.run(tenantContext, () =>
      adapter.findBillableForDate('2026-11-20', { limit: 500 }),
    );

    expect(result.map((item) => item.contractId).sort()).toEqual(
      [billableId, previousPeriodTerminatedId].sort(),
    );
    const billableContract = result.find((item) => item.contractId === billableId);
    const previousPeriodContract = result.find(
      (item) => item.contractId === previousPeriodTerminatedId,
    );
    expect(billableContract?.buyer).toMatchObject({
      documentNumber: null,
      rutResponsibilities: ['R-99-PN'],
    });
    expect(billableContract?.cycleDay).toBe(15);
    expect(billableContract?.cutoffDay).toBe(30);
    expect(billableContract?.unbilledAdditionalCount).toBe(0);
    expect(previousPeriodContract?.unbilledAdditionalCount).toBe(5);
    expect(result.map((item) => item.contractId)).not.toContain(outsideWindowTerminatedId);
  });

  it('BR-9.1 hasImpersonationSuspension distingue suspendido por suplantación', async () => {
    const suspended = await insertSubscriber();
    await insertContract({
      subscriberId: suspended,
      status: 'SUSPENDED',
      statusReasonCode: 'SUPLANTACION',
    });
    const otherReason = await insertSubscriber();
    await insertContract({
      subscriberId: otherReason,
      status: 'SUSPENDED',
      statusReasonCode: 'MORA',
    });
    const active = await insertSubscriber();
    await insertContract({ subscriberId: active, status: 'ACTIVE' });

    await expect(
      TenantContext.run(tenantContext, () => adapter.hasImpersonationSuspension(suspended)),
    ).resolves.toBe(true);
    await expect(
      TenantContext.run(tenantContext, () => adapter.hasImpersonationSuspension(otherReason)),
    ).resolves.toBe(false);
    await expect(
      TenantContext.run(tenantContext, () => adapter.hasImpersonationSuspension(active)),
    ).resolves.toBe(false);
    await expect(
      TenantContext.run(tenantContext, () =>
        adapter.hasImpersonationSuspension('00000000-0000-4000-8000-000000000099'),
      ),
    ).resolves.toBe(false);
  });

  it('BR-9.2 findByContractId es perezoso por defecto y descifra solo con revealDocument:true', async () => {
    const subscriberId = await insertSubscriber();
    const documentEncrypted = encryptAes256Gcm('SYNTHETIC-DOCUMENT', piiKey);
    const contractId = await insertContract({
      subscriberId,
      encryptedDocument: documentEncrypted,
    });

    const lazy = await TenantContext.run(tenantContext, () => adapter.findByContractId(contractId));
    expect(lazy?.buyer).toMatchObject({ documentNumber: null, hasDocumentNumber: true });
    expect(lazy?.buyer.revealDocumentNumber?.()).toBe('SYNTHETIC-DOCUMENT');

    const eager = await TenantContext.run(tenantContext, () =>
      adapter.findByContractId(contractId, { revealDocument: true }),
    );
    expect(eager?.buyer.documentNumber).toBe('SYNTHETIC-DOCUMENT');

    const lock = await TenantContext.run(tenantContext, () =>
      runInTenantSchema(dataSource, schemaName, (qr) =>
        adapter.lockTitularForBillingWrite(subscriberId, { manager: qr.manager }),
      ),
    );
    expect(lock).toMatchObject({ partyId: expect.any(String), anonymized: false });
  });
  it('resuelve referencias sin PII, excluye otros tenants y distingue inexistentes en el bloqueo', async () => {
    const present = await insertSubscriber();
    // ck_subscribers_anonymization_marker_pair (150) exige el par completo de marcas.
    const anonymized = await insertSubscriber({
      anonymizedAt: '2026-10-01T00:00:00.000Z',
      anonymizedRequestId: randomUUID(),
    });
    const missing = randomUUID();
    const foreign = randomUUID();
    await insertSubscriber({ id: foreign, tenantId: randomUUID() });
    const refs = await TenantContext.run(tenantContext, () =>
      adapter.findTitularRefs([present, anonymized, missing, foreign]),
    );
    expect(refs).toHaveLength(2);
    expect(refs).toEqual(
      expect.arrayContaining([
        { subscriberId: present, partyId: expect.any(String), anonymized: false },
        { subscriberId: anonymized, partyId: expect.any(String), anonymized: true },
      ]),
    );
    const absentLock = await TenantContext.run(tenantContext, () =>
      runInTenantSchema(dataSource, schemaName, (qr) =>
        adapter.lockTitularForBillingWrite(missing, { manager: qr.manager }),
      ),
    );
    expect(absentLock).toEqual({ exists: false, partyId: null, anonymized: false });
  });

  it('acepta lista vacía y rechaza más de 200 referencias', async () => {
    await expect(
      TenantContext.run(tenantContext, () => adapter.findTitularRefs([])),
    ).resolves.toEqual([]);
    await expect(
      TenantContext.run(tenantContext, () =>
        adapter.findTitularRefs(Array.from({ length: 201 }, () => randomUUID())),
      ),
    ).rejects.toThrow();
  });
});
