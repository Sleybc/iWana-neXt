import { randomBytes } from 'node:crypto';

import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { ExecutionOrderItemUsageRequirementKey1370000000000 } from './137_execution_order_item_usage_requirement_key';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const schema = `it_ote_req_${randomBytes(8).toString('hex')}`;

if (!dbAvailable) {
  console.warn(
    '[ote-requirement-key-integration] describe.skip activo — la migración 137 requiere PostgreSQL real.',
  );
}

describeWithDb('Migración 137 — provenance MATERIAL en PostgreSQL real', () => {
  let dataSource: DataSource;
  let runner: QueryRunner;
  const migration = new ExecutionOrderItemUsageRequirementKey1370000000000();

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
        item_id varchar(160) NOT NULL
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

  it('preserva filas antiguas como NULL y exige una migración explícita para revertir claves nuevas', async () => {
    await migration.up(runner);

    const legacy = (await runner.query(
      `SELECT requirement_key FROM execution_order_item_usage WHERE item_id = $1`,
      ['legacy-item'],
    )) as Array<{ requirement_key: string | null }>;
    expect(legacy).toEqual([{ requirement_key: null }]);

    await runner.query(
      `INSERT INTO execution_order_item_usage (id, item_id, requirement_key) VALUES ($1, $2, $3)`,
      ['22222222-2222-4222-8222-222222222222', 'new-item', 'material-ont'],
    );
    await expect(migration.down(runner)).rejects.toThrow(
      /Rollback de ExecutionOrderItemUsageRequirementKey bloqueado: 1 consumo/,
    );

    await runner.query(
      `UPDATE execution_order_item_usage SET requirement_key = NULL WHERE item_id = $1`,
      ['new-item'],
    );
    await migration.down(runner);
    const remainingColumn = (await runner.query(
      `SELECT COUNT(*)::int AS total FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'execution_order_item_usage'
          AND column_name = 'requirement_key'`,
      [schema],
    )) as Array<{ total: number }>;
    expect(remainingColumn[0]?.total).toBe(0);
  });
});
