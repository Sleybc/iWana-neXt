import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';
import { resolveMigrationDbCredentials } from '../../db-credentials';
import { InventoryExecutionRequestReceipts1390000000000 } from './139_inventory_execution_request_receipts';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const schema = `it_inv_receipts_${randomBytes(8).toString('hex')}`;

if (!dbAvailable) {
  console.warn(
    '[inventory-execution-receipts-integration] describe.skip activo — la migración 139 requiere PostgreSQL real.',
  );
}

describeWithDb('Migración 139 — recibos de inventario en PostgreSQL real', () => {
  let dataSource: DataSource;
  let runner: QueryRunner;
  const migration = new InventoryExecutionRequestReceipts1390000000000();

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
      // La limpieza opera únicamente sobre el schema efímero de esta suite.
    }
  });

  it('aplica restricciones de recibo y ejercita up/down contra PostgreSQL', async () => {
    await migration.up(runner);
    const tenantId = '11111111-1111-4111-8111-111111111111';
    const requestId = '22222222-2222-4222-8222-222222222222';
    const executionOrderId = '33333333-3333-4333-8333-333333333333';
    const movementId = '44444444-4444-4444-8444-444444444444';

    await runner.query(
      `INSERT INTO inventory_execution_request_receipts
        (id, tenant_id, inventory_request_id, execution_order_id, aggregate_version,
         outcome, stock_movement_id)
       VALUES ($1, $2, $3, $4, 1, 'CONFIRMED', $5)`,
      [randomUUID(), tenantId, requestId, executionOrderId, movementId],
    );
    await expect(
      runner.query(
        `INSERT INTO inventory_execution_request_receipts
          (id, tenant_id, inventory_request_id, execution_order_id, aggregate_version,
           outcome, stock_movement_id)
         VALUES ($1, $2, $3, $4, 1, 'CONFIRMED', $5)`,
        [randomUUID(), tenantId, requestId, executionOrderId, movementId],
      ),
    ).rejects.toMatchObject({ code: '23505' });

    await expect(migration.down(runner)).rejects.toThrow('1 recibo(s) se perderían');
    const afterBlockedDown = (await runner.query(`SELECT to_regclass($1) AS table_name`, [
      `${schema}.inventory_execution_request_receipts`,
    ])) as Array<{ table_name: string | null }>;
    expect(afterBlockedDown[0]?.table_name).not.toBeNull();

    await runner.query('DELETE FROM inventory_execution_request_receipts');
    await migration.down(runner);
    const remaining = (await runner.query(`SELECT to_regclass($1) AS table_name`, [
      `${schema}.inventory_execution_request_receipts`,
    ])) as Array<{ table_name: string | null }>;
    expect(remaining[0]?.table_name).toBeNull();
  });
});
