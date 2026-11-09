import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { resolveMigrationDbCredentials } from '@iwana/db';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../packages/database/src/migrations/tenant/runner';
import { ContractStatus } from '../modules/crm/enums/contract-status.enum';
import { SubscriberStatus } from '@iwana/shared';
import { reportLifecycleInconsistenciesInTenant } from './report-lifecycle-inconsistencies';

const schemaName = `tenant_lifecycle_report_${randomBytes(5).toString('hex')}`;
const tenantId = randomUUID();
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;

describeWithDb('Reporte de inconsistencias de ciclo de vida — PostgreSQL real', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      username: credentials.username,
      password: credentials.password,
      database: process.env['DB_NAME'] ?? 'iwana',
      entities: [],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { max: 2, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();
    // Esquema propio con la cadena tenant vigente.
    // La migración 092 exige un tenant canónico en public.tenants para su esquema.
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5)`,
      [
        tenantId,
        'Lifecycle report synthetic',
        `lifecycle-report-${tenantId.slice(0, 8)}`,
        schemaName,
        'lifecycle-report@example.invalid',
      ],
    );
    await dataSource.query(`CREATE SCHEMA "${schemaName}"`);
    const tenantDataSource = createTenantDataSource(
      dataSource,
      schemaName,
      `lifecycle-report-${schemaName}`,
    );
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }
  }, 180_000);

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
    await dataSource.destroy();
  });

  it('CA-LC-11 informa inconsistencias reales sin escribir datos ni devolver PII', async () => {
    const activatedAt = new Date('2026-01-01T00:00:00.000Z');
    const ids = {
      allSuspendedButActive: randomUUID(),
      activeContractButSuspended: randomUUID(),
      consistentActive: randomUUID(),
      noLiveContracts: randomUUID(),
      notActivated: randomUUID(),
    };
    // La cadena exige los campos de persona natural y, en ACTIVE/SUSPENDED, vat_responsibility
    // (ck_subscribers_fiscal_complete_when_active); contracts exige tenant_id, plan_id y snapshot.
    const actorId = randomUUID();
    await dataSource.query(
      `INSERT INTO "${schemaName}".subscribers
        (id, status, activated_at, tenant_id, person_type, customer_segment, vat_treatment,
         vat_responsibility, document_type, document_number_encrypted, first_name, last_name,
         stratum, address, created_by)
       VALUES
        ($1, $2, $6, $12, 'NATURAL', 'RESIDENTIAL', 'STANDARD', 'RESPONSABLE', 'CC',
         'synthetic-document-ciphertext', 'Nombre sintético', 'Apellido sintético', 2,
         'Dirección sintética', $13),
        ($3, $4, $6, $12, 'NATURAL', 'RESIDENTIAL', 'STANDARD', 'RESPONSABLE', 'CC',
         'synthetic-document-ciphertext', 'Nombre sintético', 'Apellido sintético', 2,
         'Dirección sintética', $13),
        ($5, $7, $6, $12, 'NATURAL', 'RESIDENTIAL', 'STANDARD', 'RESPONSABLE', 'CC',
         'synthetic-document-ciphertext', 'Nombre sintético', 'Apellido sintético', 2,
         'Dirección sintética', $13),
        ($8, $9, $6, $12, 'NATURAL', 'RESIDENTIAL', 'STANDARD', 'RESPONSABLE', 'CC',
         'synthetic-document-ciphertext', 'Nombre sintético', 'Apellido sintético', 2,
         'Dirección sintética', $13),
        ($10, $11, NULL, $12, 'NATURAL', 'RESIDENTIAL', 'STANDARD', 'RESPONSABLE', 'CC',
         'synthetic-document-ciphertext', 'Nombre sintético', 'Apellido sintético', 2,
         'Dirección sintética', $13)`,
      [
        ids.allSuspendedButActive,
        SubscriberStatus.ACTIVE,
        ids.activeContractButSuspended,
        SubscriberStatus.SUSPENDED,
        ids.consistentActive,
        activatedAt,
        SubscriberStatus.ACTIVE,
        ids.noLiveContracts,
        SubscriberStatus.SUSPENDED,
        ids.notActivated,
        SubscriberStatus.PROSPECT,
        tenantId,
        actorId,
      ],
    );
    await dataSource.query(
      `INSERT INTO "${schemaName}".contracts
        (id, subscriber_id, status, tenant_id, plan_id, plan_snapshot_json)
       VALUES
        ($1, $2, $3, $19, 'synthetic-plan', '{}'), ($4, $5, $6, $19, 'synthetic-plan', '{}'),
        ($7, $8, $9, $19, 'synthetic-plan', '{}'), ($10, $11, $12, $19, 'synthetic-plan', '{}'),
        ($13, $14, $15, $19, 'synthetic-plan', '{}'), ($16, $17, $18, $19, 'synthetic-plan', '{}')`,
      [
        randomUUID(),
        ids.allSuspendedButActive,
        ContractStatus.SUSPENDED,
        randomUUID(),
        ids.allSuspendedButActive,
        ContractStatus.SUSPENDED,
        randomUUID(),
        ids.allSuspendedButActive,
        ContractStatus.DRAFT,
        randomUUID(),
        ids.activeContractButSuspended,
        ContractStatus.ACTIVE,
        randomUUID(),
        ids.consistentActive,
        ContractStatus.ACTIVE,
        randomUUID(),
        ids.noLiveContracts,
        ContractStatus.DRAFT,
        tenantId,
      ],
    );

    const before = await dataSource.query(
      `SELECT
         (SELECT COUNT(*)::int FROM "${schemaName}".subscribers) AS subscribers,
         (SELECT COUNT(*)::int FROM "${schemaName}".contracts) AS contracts`,
    );
    const report = await reportLifecycleInconsistenciesInTenant(dataSource, schemaName);
    const after = await dataSource.query(
      `SELECT
         (SELECT COUNT(*)::int FROM "${schemaName}".subscribers) AS subscribers,
         (SELECT COUNT(*)::int FROM "${schemaName}".contracts) AS contracts`,
    );

    expect(report.subscribersScanned).toBe(5);
    expect(report.inconsistenciesFound).toBe(2);
    expect(report.inconsistencies).toEqual(
      expect.arrayContaining([
        {
          subscriberId: ids.allSuspendedButActive,
          currentStatus: SubscriberStatus.ACTIVE,
          derivedStatus: SubscriberStatus.SUSPENDED,
          contractsByStatus: {
            [ContractStatus.SUSPENDED]: 2,
            [ContractStatus.DRAFT]: 1,
          },
        },
        {
          subscriberId: ids.activeContractButSuspended,
          currentStatus: SubscriberStatus.SUSPENDED,
          derivedStatus: SubscriberStatus.ACTIVE,
          contractsByStatus: { [ContractStatus.ACTIVE]: 1 },
        },
      ]),
    );
    expect(after).toEqual(before);
    expect(JSON.stringify(report)).not.toMatch(/email|phone|name|address/i);
  });
});
