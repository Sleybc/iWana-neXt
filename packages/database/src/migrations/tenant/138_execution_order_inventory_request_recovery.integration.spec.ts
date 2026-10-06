import { randomBytes } from 'node:crypto';

import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { ExecutionOrderInventoryRequestRecovery1380000000000 } from './138_execution_order_inventory_request_recovery';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const schema = `it_inv_recovery_${randomBytes(8).toString('hex')}`;

if (!dbAvailable) {
  console.warn(
    '[inventory-request-recovery-integration] describe.skip activo — la migración 138 requiere PostgreSQL real.',
  );
}

describeWithDb('Migración 138 — recuperación de consumos de OT en PostgreSQL real', () => {
  let dataSource: DataSource;
  let runner: QueryRunner;
  const migration = new ExecutionOrderInventoryRequestRecovery1380000000000();

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

    const bootstrap = dataSource.createQueryRunner();
    await bootstrap.connect();
    try {
      await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await bootstrap.query(`CREATE SCHEMA "${schema}"`);
    } finally {
      await bootstrap.release();
    }

    runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.query(`SET search_path TO "${schema}"`);
    await runner.query(`
      CREATE TABLE execution_order_item_usage (
        id uuid PRIMARY KEY,
        item_id varchar(160) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT NOW()
      )
    `);
    await runner.query(`INSERT INTO execution_order_item_usage (id, item_id) VALUES ($1, $2)`, [
      '11111111-1111-4111-8111-111111111111',
      'legacy-item',
    ]);
  });

  afterAll(async () => {
    try {
      if (runner && !runner.isReleased) {
        await runner.query('SET search_path TO public');
        await runner.release();
      }
      if (dataSource?.isInitialized) {
        await dataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await dataSource.destroy();
      }
    } catch {
      // La limpieza opera únicamente sobre el schema efímero de esta suite.
    }
  });

  it('aplica los defaults y ejercita up/down contra PostgreSQL', async () => {
    await migration.up(runner);

    const defaults = (await runner.query(
      `
      SELECT rejection_reason_code, last_requested_at, request_attempts
        FROM execution_order_item_usage
       WHERE item_id = $1
    `,
      ['legacy-item'],
    )) as Array<{
      rejection_reason_code: string | null;
      last_requested_at: Date | null;
      request_attempts: number;
    }>;
    expect(defaults).toEqual([
      { rejection_reason_code: null, last_requested_at: null, request_attempts: 1 },
    ]);

    await runner.query(
      `UPDATE execution_order_item_usage SET rejection_reason_code = $2 WHERE item_id = $1`,
      ['legacy-item', 'ITEM_INACTIVE'],
    );
    await migration.down(runner);

    const remainingColumns = (await runner.query(
      `
      SELECT column_name
        FROM information_schema.columns
       WHERE table_schema = $1
         AND table_name = 'execution_order_item_usage'
         AND column_name = ANY($2::text[])
    `,
      [schema, ['rejection_reason_code', 'last_requested_at', 'request_attempts']],
    )) as Array<{
      column_name: string;
    }>;
    expect(remainingColumns).toEqual([]);
  });
});
