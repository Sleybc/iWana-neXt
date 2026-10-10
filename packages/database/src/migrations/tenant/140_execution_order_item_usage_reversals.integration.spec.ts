import { randomBytes } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';
import { resolveMigrationDbCredentials } from '../../db-credentials';
import { ExecutionOrderItemUsageReversals1400000000000 } from './140_execution_order_item_usage_reversals';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const schema = `it_ote_rev_${randomBytes(8).toString('hex')}`;

if (!dbAvailable) {
  console.warn(
    '[ote-reversals-140-integration] describe.skip activo — la migración 140 requiere PostgreSQL real.',
  );
}

describeWithDb('Migración 140 — reversos de consumo en PostgreSQL real', () => {
  let dataSource: DataSource;
  let runner: QueryRunner;
  const migration = new ExecutionOrderItemUsageReversals1400000000000();

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
      // La limpieza solo puede afectar al schema efímero de esta suite.
    }
  });

  it('aplica el índice parcial, conserva el histórico y bloquea down con filas', async () => {
    await runner.query(`
      CREATE TABLE execution_order_item_usage (
        id uuid PRIMARY KEY,
        item_id varchar(160) NOT NULL
      )
    `);
    await migration.up(runner);

    const indexes = (await runner.query(
      `
      SELECT index_class.relname AS index_name,
             index_meta.indisunique AS is_unique,
             (index_meta.indpred IS NOT NULL) AS is_partial,
             index_meta.indnkeyatts::int AS key_count,
             pg_get_indexdef(index_meta.indexrelid, 1, true) AS key_column,
             pg_get_expr(index_meta.indpred, index_meta.indrelid) AS predicate
        FROM pg_index AS index_meta
        JOIN pg_class AS table_class ON table_class.oid = index_meta.indrelid
        JOIN pg_namespace AS table_namespace ON table_namespace.oid = table_class.relnamespace
        JOIN pg_class AS index_class ON index_class.oid = index_meta.indexrelid
       WHERE table_namespace.nspname = $1
         AND table_class.relname = 'execution_order_item_usage_reversals'
         AND index_class.relname = 'uq_execution_order_item_usage_reversals_active_usage'
    `,
      [schema],
    )) as Array<{
      index_name: string;
      is_unique: boolean;
      is_partial: boolean;
      key_count: number;
      key_column: string;
      predicate: string | null;
    }>;
    const activeIndex = indexes[0];
    if (!activeIndex)
      throw new Error('El índice parcial de reversos activos no aparece en pg_index.');
    expect(activeIndex).toMatchObject({
      index_name: 'uq_execution_order_item_usage_reversals_active_usage',
      is_unique: true,
      is_partial: true,
      key_count: 1,
      key_column: 'item_usage_id',
    });
    if (!activeIndex.predicate)
      throw new Error('El índice de reversos activos no tiene predicado.');
    const normalizedPredicate = activeIndex.predicate
      .replace(/::(?:text|character varying)(?:\[\])?/gi, '')
      .replace(/[\s()]/g, '')
      .toUpperCase();
    expect(normalizedPredicate).toBe("STATUS=ANYARRAY['PENDING','CONFIRMED']");

    await runner.query(
      `INSERT INTO execution_order_item_usage_reversals
         (tenant_id, execution_order_id, item_usage_id, reversal_request_id, reason, requested_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        '33333333-3333-4333-8333-333333333333',
        '44444444-4444-4444-8444-444444444444',
        'auditoría operativa',
        '55555555-5555-4555-8555-555555555555',
      ],
    );
    await expect(migration.down(runner)).rejects.toThrow(
      /Rollback de ExecutionOrderItemUsageReversals bloqueado: 1 reverso/,
    );

    await runner.query(`DELETE FROM execution_order_item_usage_reversals`);
    await migration.down(runner);
    const remaining = (await runner.query(
      `
      SELECT COUNT(*)::int AS total FROM information_schema.tables
       WHERE table_schema = $1 AND table_name = 'execution_order_item_usage_reversals'
    `,
      [schema],
    )) as Array<{ total: number }>;
    expect(remaining[0]?.total).toBe(0);
  });
});
