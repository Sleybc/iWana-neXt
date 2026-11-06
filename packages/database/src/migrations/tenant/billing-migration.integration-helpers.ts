import { randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';

const INTEGRATION_DATABASE_NAME = /^(?:test|iwana_it_[a-z0-9_]+)$/u;
const integrationDatabaseName = process.env['DB_NAME'] ?? '';
const integrationDatabaseNameAllowed = INTEGRATION_DATABASE_NAME.test(integrationDatabaseName);

export const billingPostgresIntegrationEnabled =
  process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true' && integrationDatabaseNameAllowed;

if (!integrationDatabaseNameAllowed) {
  console.warn(
    [
      '',
      '='.repeat(78),
      '[MOD14-integration] SUITE OMITIDA — DB_NAME no está permitido.',
      '  aceptados: test e iwana_it_*',
      '  Solo se crean y eliminan schemas de fixtures.',
      '='.repeat(78),
      '',
    ].join('\n'),
  );
}

export function createBillingIntegrationDataSource(): DataSource {
  const credentials = resolveMigrationDbCredentials();

  return new DataSource({
    type: 'postgres',
    host: process.env['DB_HOST'] ?? 'localhost',
    port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
    ...credentials,
    database: process.env['DB_NAME'] ?? '',
    entities: [],
    migrations: [],
    synchronize: false,
    logging: false,
    extra: { max: 2, min: 1, connectionTimeoutMillis: 5_000 },
  });
}

export interface BillingTenantFixture {
  schemaName: string;
  tenantId: string;
  queryRunner: QueryRunner;
}

export async function createBillingTenantFixture(
  dataSource: DataSource,
  prefix: 'tenant_billing173' | 'tenant_billing174' | 'tenant_billing175',
): Promise<BillingTenantFixture> {
  const schemaName = `${prefix}_${randomUUID().replaceAll('-', '')}`;
  const tenantId = randomUUID();
  const bootstrap = dataSource.createQueryRunner();

  await bootstrap.connect();
  try {
    await bootstrap.query(`CREATE SCHEMA "${schemaName}"`);
    await bootstrap.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, contact_email, status)
       VALUES ($1, 'Fixture MOD14', $2, $3, $4, 'INACTIVE')`,
      [tenantId, `${schemaName}-slug`, schemaName, `${schemaName}@invalid.example`],
    );
  } finally {
    await bootstrap.release();
  }

  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.query(`SET search_path TO "${schemaName}", public`);

  return { schemaName, tenantId, queryRunner };
}

export async function dropBillingTenantFixture(
  dataSource: DataSource | undefined,
  fixture: BillingTenantFixture | undefined,
): Promise<void> {
  try {
    if (fixture?.queryRunner && !fixture.queryRunner.isReleased) {
      await fixture.queryRunner.release();
    }
  } finally {
    if (dataSource?.isInitialized) {
      const cleanup = dataSource.createQueryRunner();
      try {
        if (fixture) {
          await cleanup.query(`DROP SCHEMA IF EXISTS "${fixture.schemaName}" CASCADE`);
          await cleanup.query('DELETE FROM public.tenants WHERE id = $1', [fixture.tenantId]);
        }
      } finally {
        await cleanup.release();
        await dataSource.destroy();
      }
    }
  }
}
