import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { TenantContext, resolveMigrationDbCredentials } from '@iwana/db';
import { runInTenantSchema } from '@iwana/db';
import { CrmContractStandingReadAdapter } from './crm-contract-standing-read.adapter';
import { CrmPersonalDataErasureAdapter } from './crm-personal-data-erasure.adapter';
import { CrmTitularErasureParticipant } from './titular-erasure/crm-titular-erasure.participant';
import { PartyTitularErasureParticipant } from '../../parties/privacy/party-titular-erasure.participant';
import { UserAccountErasureParticipant } from '../../users/privacy/user-account-erasure.participant';
import { WfmTitularErasureParticipant } from '../../wfm/privacy/wfm-titular-erasure.participant';
import { ExecutionOrderTitularErasureParticipant } from '../../tasks/privacy/execution-order-titular-erasure.participant';
import { OperationalTaskTitularErasureParticipant } from '../../tasks/privacy/operational-task-titular-erasure.participant';
import { MediaTitularErasureParticipant } from '../../media/privacy/media-titular-erasure.participant';
import { BillingTitularErasureParticipant } from '../../billing/privacy/billing-titular-erasure.participant';
import { AssuranceTitularErasureParticipant } from '../../assurance/privacy/assurance-titular-erasure.participant';
import { NetworkTitularErasureParticipant } from '../../network/privacy/network-titular-erasure.participant';
import { SupplierProfileReadAdapter } from '../../inventory/privacy/supplier-profile-read.adapter';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../packages/database/src/migrations/tenant/runner';

/**
 * H-EXP B2-R2: alcance explícito de prospecto en el puerto de supresión.
 * `resolve()` toma solo el expediente indicado, lo revalida en la
 * transacción con FOR UPDATE (DESCARTADO, sin suscriptor ni contrato) y
 * nunca amplía por HMAC. Sin el alcance, el comportamiento es idéntico.
 */
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const allowedDatabaseName = /^(test|iwana_it_[a-z0-9_]+)$/u;

jest.setTimeout(900_000);

describeWithDb('CrmPersonalDataErasureAdapter — prospecto explícito (H-EXP B2-R2)', () => {
  const schemaName = `tenant_hexp_b2r2_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const tenantId = randomUUID();
  const tenantSlug = `hexp-b2r2-${randomUUID().slice(0, 8)}`;
  const actorId = randomUUID();

  let baseDataSource: DataSource | undefined;
  let adapter: CrmPersonalDataErasureAdapter | undefined;

  const inTenant = <T>(operation: () => Promise<T>): Promise<T> =>
    TenantContext.run({ tenantId, schemaName, tenantSlug }, operation);

  function inSchema<T>(operation: (qr: import('typeorm').QueryRunner) => Promise<T>): Promise<T> {
    if (!baseDataSource) throw new Error('Integración no inicializada.');
    return runInTenantSchema(baseDataSource, schemaName, (queryRunner) =>
      inTenant(() => operation(queryRunner)),
    );
  }

  async function q(sql: string, params: unknown[] = []): Promise<Array<Record<string, unknown>>> {
    if (!baseDataSource) throw new Error('Integración no inicializada.');
    return (await baseDataSource.query(sql, params)) as Array<Record<string, unknown>>;
  }

  async function makeProspect(statusChangedAt: string): Promise<string> {
    const id = randomUUID();
    await q(
      `INSERT INTO "${schemaName}".expediente_records
         (id, tenant_id, full_name, status, status_changed_at, created_by)
        VALUES ($1, $2, 'Prospecto sintético B2-R2', 'DESCARTADO', $3, $4)`,
      [id, tenantId, statusChangedAt, actorId],
    );
    return id;
  }

  beforeAll(async () => {
    const databaseName = process.env['DB_NAME'] ?? '';
    if (!allowedDatabaseName.test(databaseName)) {
      throw new Error('Integración B2-R2: DB_NAME debe ser test o iwana_it_*; nunca desarrollo.');
    }
    const credentials = resolveMigrationDbCredentials();
    baseDataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      username: credentials.username,
      password: credentials.password,
      database: databaseName,
      entities: [],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { max: 2, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await baseDataSource.initialize();
    const bootstrap = baseDataSource.createQueryRunner();
    try {
      await bootstrap.query(`CREATE SCHEMA "${schemaName}"`);
      await bootstrap.query(
        `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
         VALUES ($1, 'H-EXP B2-R2 sintético', $2, $3, 'ACTIVE', 'hexp-b2r2@invalid.example')`,
        [tenantId, tenantSlug, schemaName],
      );
    } finally {
      await bootstrap.release();
    }
    const tenantDataSource = createTenantDataSource(baseDataSource, schemaName, tenantSlug);
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }

    const moduleRef = await Test.createTestingModule({
      providers: [
        { provide: ConfigService, useValue: new ConfigService(process.env) },
        CrmContractStandingReadAdapter,
        CrmTitularErasureParticipant,
        PartyTitularErasureParticipant,
        UserAccountErasureParticipant,
        WfmTitularErasureParticipant,
        ExecutionOrderTitularErasureParticipant,
        OperationalTaskTitularErasureParticipant,
        MediaTitularErasureParticipant,
        BillingTitularErasureParticipant,
        AssuranceTitularErasureParticipant,
        NetworkTitularErasureParticipant,
        SupplierProfileReadAdapter,
        CrmPersonalDataErasureAdapter,
      ],
    }).compile();
    adapter = moduleRef.get(CrmPersonalDataErasureAdapter);
  }, 180_000);

  afterAll(async () => {
    if (baseDataSource?.isInitialized) {
      try {
        await baseDataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
        await baseDataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
      } finally {
        await baseDataSource.destroy();
      }
      baseDataSource = undefined;
    }
  });

  it('plan y anonymize toman solo el expediente del prospecto sin tocar el resto', async () => {
    if (!adapter) throw new Error('Integración no inicializada.');
    const expiry = adapter;
    const id = await makeProspect('2024-11-08T12:00:00Z');
    const markingId = randomUUID();
    const target = {
      requestId: markingId,
      partyId: null,
      requesterDocumentHmac: null,
      prospectExpedienteId: id,
    };

    const plan = await inSchema((qr) => expiry.plan(target, { manager: qr.manager }));
    expect(plan.candidateExpedienteIds).toEqual([id]);
    expect(plan.blockers).toEqual([]);

    const applied = await inSchema((qr) =>
      expiry.anonymize({ ...target, expedienteIds: [id], actorId }, { manager: qr.manager }),
    );
    expect(applied.changedRows).toBeGreaterThan(0);

    const rows = (await q(
      `SELECT full_name, anonymized_at IS NOT NULL AS marked,
              anonymized_request_id::text AS marking
         FROM "${schemaName}".expediente_records WHERE id = $1`,
      [id],
    )) as Array<{ full_name: string; marked: boolean; marking: string }>;
    expect(rows[0]?.marked).toBe(true);
    expect(rows[0]?.marking).toBe(markingId);
    expect(rows[0]?.full_name).not.toBe('Prospecto sintético B2-R2');
    // Ningún participante escribió fuera del alcance: no hay otras filas.
    for (const table of ['subscribers', 'contracts', 'party'] as const) {
      const count = (await q(`SELECT COUNT(*)::int AS n FROM "${schemaName}".${table}`)) as Array<{
        n: number;
      }>;
      expect(count[0]?.n).toBe(0);
    }
  });

  it('un contrato sobrevenido entre plan y anonymize queda bloqueado sin cambios', async () => {
    if (!adapter) throw new Error('Integración no inicializada.');
    const expiry = adapter;
    const id = await makeProspect('2024-11-08T12:00:00Z');
    const markingId = randomUUID();
    const target = {
      requestId: markingId,
      partyId: null,
      requesterDocumentHmac: null,
      prospectExpedienteId: id,
    };

    const clean = await inSchema((qr) => expiry.plan(target, { manager: qr.manager }));
    expect(clean.blockers).toEqual([]);

    // Sobreviene un contrato enlazado al expediente antes de anonimizar.
    const subscriberId = randomUUID();
    await q(
      `INSERT INTO "${schemaName}".subscribers
         (id, tenant_id, expediente_id, person_type, customer_segment, document_type,
          document_number_encrypted, first_name, last_name, stratum, email_encrypted,
          phone_encrypted, vat_treatment, tax_regime, vat_responsibility, address, created_by)
       VALUES ($1, $2, $3, 'NATURAL', 'RESIDENTIAL', 'CC', 'sintetico',
         'Sonda', 'Contrato', 3, 'sintetico', 'sintetico', 'STANDARD', 'SIMPLIFIED', 'RESPONSABLE', 'Sonda', $4)`,
      [subscriberId, tenantId, id, actorId],
    );
    await q(
      `INSERT INTO "${schemaName}".contracts
         (id, tenant_id, subscriber_id, plan_id, plan_snapshot_json, status,
          additional_product_ids, additional_service_ids)
       VALUES ($1, $2, $3, 'plan-sintetico', '{}'::jsonb, 'ACTIVE', '{}', '{}')`,
      [randomUUID(), tenantId, subscriberId],
    );

    const blocked = await inSchema((qr) => expiry.plan(target, { manager: qr.manager }));
    expect(blocked.blockers).toEqual(['UNRECONCILED_TITULAR']);

    const error = await inSchema((qr) =>
      expiry
        .anonymize({ ...target, expedienteIds: [id], actorId }, { manager: qr.manager })
        .catch((caught: unknown) => caught),
    );
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'PRIVACY_ERASURE_UNRECONCILED_TITULAR',
    });

    // Sin cambios: el expediente conserva sus datos y el contrato sobrevenido
    // queda intacto para la conciliación operativa.
    const rows = (await q(
      `SELECT full_name, anonymized_at FROM "${schemaName}".expediente_records WHERE id = $1`,
      [id],
    )) as Array<{ full_name: string | null; anonymized_at: Date | null }>;
    expect(rows[0]?.full_name).toBe('Prospecto sintético B2-R2');
    expect(rows[0]?.anonymized_at).toBeNull();
    const contracts = (await q(
      `SELECT status FROM "${schemaName}".contracts WHERE subscriber_id = $1`,
      [subscriberId],
    )) as Array<{ status: string }>;
    expect(contracts).toHaveLength(1);
    expect(contracts[0]?.status).toBe('ACTIVE');
  });
});
