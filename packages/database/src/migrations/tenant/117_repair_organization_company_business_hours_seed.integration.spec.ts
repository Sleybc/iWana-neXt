import { randomBytes, randomUUID } from 'node:crypto';

import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { RepairOrganizationCompanyBusinessHoursSeed1170000000000 } from './117_repair_organization_company_business_hours_seed';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;

describeWithDb('117 repair company business hours seed - PostgreSQL real', () => {
  let dataSource: DataSource;
  let emptyRunner: QueryRunner;
  let configuredEmptyRunner: QueryRunner;
  let schemas: [string, string];
  let tenantIds: [string, string];
  const migration = new RepairOrganizationCompanyBusinessHoursSeed1170000000000();

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
      extra: { max: 3, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();

    const suffix = randomBytes(6).toString('hex');
    schemas = [`tenant_it117_${suffix}_a`, `tenant_it117_${suffix}_b`];
    tenantIds = [randomUUID(), randomUUID()];

    const bootstrap = dataSource.createQueryRunner();
    await bootstrap.connect();
    try {
      for (const [index, schema] of schemas.entries()) {
        await bootstrap.query(`CREATE SCHEMA "${schema}"`);
        await bootstrap.query(
          `INSERT INTO public.tenants (id, name, slug, schema_name, contact_email)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            tenantIds[index],
            `Integration tenant 117 ${index + 1}`,
            `${schema}-slug`,
            schema,
            `${schema}@invalid.example`,
          ],
        );
      }
    } finally {
      await bootstrap.release();
    }

    emptyRunner = await createRunnerForSchema(dataSource, schemas[0]);
    configuredEmptyRunner = await createRunnerForSchema(dataSource, schemas[1]);
    await configuredEmptyRunner.query(
      `INSERT INTO audit_logs (tenant_id, entity_type) VALUES ($1, 'organization_company_business_hours')`,
      [tenantIds[1]],
    );
  });

  afterAll(async () => {
    await emptyRunner?.release();
    await configuredEmptyRunner?.release();

    if (!dataSource?.isInitialized) return;

    const cleanup = dataSource.createQueryRunner();
    await cleanup.connect();
    try {
      for (const [index, schema] of schemas.entries()) {
        await cleanup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await cleanup.query('DELETE FROM public.tenants WHERE id = $1', [tenantIds[index]]);
      }
    } finally {
      await cleanup.release();
      await dataSource.destroy();
    }
  });

  it('siembra siete dias, es idempotente y revierte el conjunto intacto', async () => {
    await migration.up(emptyRunner);
    await migration.up(emptyRunner);

    const seededRows = await loadHours(emptyRunner);
    expect(seededRows).toHaveLength(7);
    expect(seededRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ weekday: 'MONDAY', opens_at: '07:00:00', closes_at: '18:00:00' }),
        expect.objectContaining({ weekday: 'SUNDAY', opens_at: '07:00:00', closes_at: '18:00:00' }),
      ]),
    );

    await migration.down(emptyRunner);
    expect(await loadHours(emptyRunner)).toEqual([]);
  });

  it('respeta una configuracion explicitamente vacia registrada en auditoria', async () => {
    await migration.up(configuredEmptyRunner);

    expect(await loadHours(configuredEmptyRunner)).toEqual([]);
  });

  it('aborta el rollback completo si una fila sembrada fue modificada', async () => {
    await migration.up(emptyRunner);
    await emptyRunner.query(
      `UPDATE organization_company_business_hours
       SET closes_at = TIME '17:00:00', updated_at = NOW() + INTERVAL '1 second'
       WHERE weekday = 'MONDAY'`,
    );

    await expect(migration.down(emptyRunner)).rejects.toThrow('la semilla fue modificada');
    expect(await loadHours(emptyRunner)).toHaveLength(7);
  });
});

async function createRunnerForSchema(dataSource: DataSource, schema: string): Promise<QueryRunner> {
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  await runner.query(`SET search_path TO "${schema}"`);
  await runner.query(`
    CREATE TYPE business_hours_weekday_enum AS ENUM (
      'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'
    )
  `);
  await runner.query(`
    CREATE TABLE organization_company_business_hours (
      id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL,
      weekday business_hours_weekday_enum NOT NULL,
      opens_at TIME,
      closes_at TIME,
      is_open BOOLEAN NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, weekday)
    )
  `);
  await runner.query(`
    CREATE TABLE audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL,
      entity_type VARCHAR(100) NOT NULL
    )
  `);
  return runner;
}

async function loadHours(
  runner: QueryRunner,
): Promise<Array<{ weekday: string; opens_at: string; closes_at: string }>> {
  return runner.query(
    `SELECT weekday::text, opens_at::text, closes_at::text
     FROM organization_company_business_hours
     ORDER BY weekday::text`,
  ) as Promise<Array<{ weekday: string; opens_at: string; closes_at: string }>>;
}
