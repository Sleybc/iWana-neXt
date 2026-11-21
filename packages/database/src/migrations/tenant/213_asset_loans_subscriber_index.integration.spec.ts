import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { AssetLoansSubscriberIndex2130000000213 } from './213_asset_loans_subscriber_index';
import { ephemeralSchemaName } from '../../../test/ephemeral-schema';

const SCHEMA = ephemeralSchemaName('tenant_mod12_loans_213_');
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const INTEGRATION_DATABASE_NAME = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;

if (dbAvailable && !INTEGRATION_DATABASE_NAME.test(process.env['DB_NAME'] ?? '')) {
  throw new Error(
    'Integración 213: DB_NAME debe ser dbiw, test o iwana_it_*; solo crea y limpia un schema efímero.',
  );
}

function requireRunner(runner: QueryRunner | undefined): QueryRunner {
  if (!runner) throw new Error('QueryRunner de integración no inicializado.');
  return runner;
}

describeWithDb('Migración 213 — índices de equipos del suscriptor en PostgreSQL real', () => {
  let dataSource: DataSource | undefined;
  let runner: QueryRunner | undefined;
  const migration = new AssetLoansSubscriberIndex2130000000213();

  async function indexes(): Promise<Array<{ indexname: string; indexdef: string }>> {
    return (await requireRunner(runner).query(
      `SELECT indexname, indexdef FROM pg_indexes
        WHERE schemaname = current_schema()
          AND indexname IN (
            'idx_asset_loan_assignments_tenant_subscriber',
            'idx_stock_movement_lines_tenant_location'
          )
        ORDER BY indexname`,
    )) as Array<{ indexname: string; indexdef: string }>;
  }

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
    await dataSource.query(`CREATE SCHEMA "${SCHEMA}"`);

    runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.query(`SET search_path TO "${SCHEMA}"`);
    await runner.query(
      'CREATE TABLE asset_loan_assignments (id uuid PRIMARY KEY, tenant_id uuid NOT NULL, subscriber_ref_id uuid NOT NULL)',
    );
    await runner.query(
      'CREATE TABLE stock_movement_lines (id uuid PRIMARY KEY, tenant_id uuid NOT NULL, location_id uuid NOT NULL)',
    );
  });

  afterAll(async () => {
    try {
      if (runner && !runner.isReleased) await runner.release();
    } finally {
      if (dataSource?.isInitialized) {
        try {
          await dataSource.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
        } finally {
          await dataSource.destroy();
        }
      }
    }
  });

  it('up crea los dos índices con sus columnas y es idempotente', async () => {
    const active = requireRunner(runner);
    await migration.up(active);
    await migration.up(active);

    expect(await indexes()).toEqual([
      {
        indexname: 'idx_asset_loan_assignments_tenant_subscriber',
        indexdef: expect.stringMatching(/\(tenant_id, subscriber_ref_id\)/u),
      },
      {
        indexname: 'idx_stock_movement_lines_tenant_location',
        indexdef: expect.stringMatching(/\(tenant_id, location_id\)/u),
      },
    ]);
  });

  it('down retira los dos índices y conserva las filas', async () => {
    const active = requireRunner(runner);
    await migration.up(active);
    await active.query(
      'INSERT INTO asset_loan_assignments (id, tenant_id, subscriber_ref_id) VALUES ($1, $2, $3)',
      [randomUUID(), randomUUID(), randomUUID()],
    );
    await active.query(
      'INSERT INTO stock_movement_lines (id, tenant_id, location_id) VALUES ($1, $2, $3)',
      [randomUUID(), randomUUID(), randomUUID()],
    );

    await migration.down(active);

    expect(await indexes()).toEqual([]);
    await expect(
      active.query('SELECT COUNT(*)::int AS total FROM asset_loan_assignments'),
    ).resolves.toEqual([{ total: 1 }]);
    await expect(
      active.query('SELECT COUNT(*)::int AS total FROM stock_movement_lines'),
    ).resolves.toEqual([{ total: 1 }]);
  });
});
