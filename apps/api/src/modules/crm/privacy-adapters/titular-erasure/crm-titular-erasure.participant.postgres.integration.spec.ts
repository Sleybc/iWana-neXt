import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { DataSource, QueryRunner } from 'typeorm';
import { resolveMigrationDbCredentials } from '../../../../../../../packages/database/src/db-credentials';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
  TENANT_MIGRATIONS,
} from '../../../../../../../packages/database/src/migrations/tenant/runner';
import type { ErasureKeys } from './titular-erasure-sql';
import { CrmTitularErasureParticipant } from './crm-titular-erasure.participant';

const integrationEnabled = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const databaseName = process.env['DB_NAME'] ?? '';
const safeDatabaseName = /^iwana_it_g7_[a-z0-9_]+$/u;
const supportedDatabaseName = databaseName === 'test' || safeDatabaseName.test(databaseName);
const describeWithDb = integrationEnabled && supportedDatabaseName ? describe : describe.skip;

if (integrationEnabled && !supportedDatabaseName) {
  console.warn(
    `[B1c] Integración omitida: DB_NAME debe ser test o iwana_it_g7_*; recibida ${databaseName || '(vacía)'}.`,
  );
}

jest.setTimeout(900_000);

describeWithDb('B1c — supresión CRM sobre migraciones tenant reales', () => {
  const schemaName = `tenant_it_g7_b1c_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const tenantId = randomUUID();
  const tenantSlug = `privacy-g7-${randomUUID().slice(0, 8)}`;
  const subscriberId = randomUUID();
  const residentialContractId = randomUUID();
  const nonResidentialContractId = randomUUID();
  const actorId = randomUUID();
  const requestId = randomUUID();
  const keys: ErasureKeys = {
    hashKey: Buffer.alloc(32, 1),
    activeEncryptionKey: Buffer.alloc(32, 2),
    previousEncryptionKey: null,
  };
  let baseDataSource: DataSource | undefined;
  let tenantDataSource: DataSource | undefined;
  let queryRunner: QueryRunner | undefined;

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    baseDataSource = new DataSource({
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
    await baseDataSource.initialize();

    const bootstrap = baseDataSource.createQueryRunner();
    try {
      await bootstrap.query(`CREATE SCHEMA "${schemaName}"`);
      await bootstrap.query(
        `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
         VALUES ($1, 'B1c synthetic fixture', $2, $3, 'INACTIVE', 'b1c@invalid.example')`,
        [tenantId, tenantSlug, schemaName],
      );
    } finally {
      await bootstrap.release();
    }

    tenantDataSource = createTenantDataSource(baseDataSource, schemaName, tenantSlug);
    await tenantDataSource.initialize();
    await applyTenantMigrationsInOrder(tenantDataSource, {
      ...process.env,
      IWANA_APPLY_PII_CONTRACT: 'true',
    });
    queryRunner = tenantDataSource.createQueryRunner();
    await queryRunner.connect();
    const [migrationCountRow] = (await queryRunner.query(
      'SELECT COUNT(*)::int AS count FROM typeorm_migrations',
    )) as Array<{ count: number }>;
    const appliedMigrationCount = migrationCountRow?.count ?? 0;
    console.info(
      `[B1c] Tenant migrations applied: ${appliedMigrationCount}/${TENANT_MIGRATIONS.length}.`,
    );
    expect(appliedMigrationCount).toBe(TENANT_MIGRATIONS.length);
  });

  afterAll(async () => {
    try {
      if (queryRunner && !queryRunner.isReleased) await queryRunner.release();
    } finally {
      if (tenantDataSource?.isInitialized) await tenantDataSource.destroy();
      if (baseDataSource?.isInitialized) {
        const cleanup = baseDataSource.createQueryRunner();
        try {
          await cleanup.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
          await cleanup.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
        } finally {
          await cleanup.release();
          await baseDataSource.destroy();
        }
      }
    }
  });

  it('CA-BT-17 conserva RESIDENTIAL y NON_RESIDENTIAL y marca el estrato con 1', async () => {
    if (!queryRunner) throw new Error('QueryRunner de integración no inicializado.');

    await queryRunner.query(
      `INSERT INTO subscribers (
         id, tenant_id, person_type, customer_segment, document_type,
         document_number_encrypted, first_name, last_name, stratum,
         email_encrypted, phone_encrypted, vat_treatment, tax_regime,
         address, created_by
       ) VALUES (
         $1, $2, 'NATURAL', 'RESIDENTIAL', 'CC', 'synthetic-encrypted',
         'Fixture', 'B1c', 3, 'synthetic-email', 'synthetic-phone',
         'STANDARD', 'SIMPLIFIED', 'Dirección sintética', $3
       )`,
      [subscriberId, tenantId, actorId],
    );

    await queryRunner.query(
      `INSERT INTO contracts (
         id, tenant_id, subscriber_id, plan_id, plan_snapshot_json, status, alias,
         service_usage, installation_stratum, installation_city,
         installation_department, installation_address, installation_postal_code,
         installation_notes
       ) VALUES
         ($1, $2, $3, 'fixture-plan', '{}'::jsonb, 'DRAFT', 'Servicio sintético 1',
          'RESIDENTIAL', 4, 'Ciudad sintética', 'Departamento sintético',
          'Dirección sintética', '00000', 'Nota sintética'),
         ($4, $2, $3, 'fixture-plan', '{}'::jsonb, 'DRAFT', 'Servicio sintético 2',
          'NON_RESIDENTIAL', NULL, 'Ciudad sintética', 'Departamento sintético',
          'Dirección sintética', '00000', 'Nota sintética')`,
      [residentialContractId, tenantId, subscriberId, nonResidentialContractId],
    );

    const participant = new CrmTitularErasureParticipant(
      new ConfigService({ PII_HASH_KEY: keys.hashKey.toString('hex') }),
    );
    await queryRunner.startTransaction();
    try {
      await queryRunner.query(`SELECT set_config('iwana.titular_erasure', 'on', true)`);
      await participant.apply(
        {
          partyId: null,
          subscriberIds: [subscriberId],
          expedienteIds: [],
          userIds: [],
          requestId,
          cryptoKeys: keys,
        },
        queryRunner,
        'apply',
      );
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    }

    const contracts = (await queryRunner.query(
      `SELECT id, service_usage, installation_stratum
         FROM contracts
        WHERE id = ANY($1::uuid[])
        ORDER BY service_usage`,
      [[residentialContractId, nonResidentialContractId]],
    )) as Array<{ id: string; service_usage: string; installation_stratum: number | null }>;

    expect(contracts).toEqual([
      {
        id: nonResidentialContractId,
        service_usage: 'NON_RESIDENTIAL',
        installation_stratum: 1,
      },
      {
        id: residentialContractId,
        service_usage: 'RESIDENTIAL',
        installation_stratum: 1,
      },
    ]);
  });
});
