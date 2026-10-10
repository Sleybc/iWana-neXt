import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';
import { resolveMigrationDbCredentials } from '../../db-credentials';
import { InventoryExecutionRequestReceipts1390000000000 } from './139_inventory_execution_request_receipts';
import { InventoryExecutionRequestReversalReceipts1410000000000 } from './141_inventory_execution_request_reversal_receipts';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const schema = `it_inv_reversal_${randomBytes(8).toString('hex')}`;

describeWithDb('Migración 141 — recibos de reverso en PostgreSQL real', () => {
  let dataSource: DataSource;
  let runner: QueryRunner;
  const migration139 = new InventoryExecutionRequestReceipts1390000000000();
  const migration141 = new InventoryExecutionRequestReversalReceipts1410000000000();

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
    await migration139.up(runner);
    await runner.query(`
      CREATE TYPE stock_movement_origin AS ENUM (
        'PURCHASE_RECEIPT', 'TRANSFER', 'EXECUTION_ORDER', 'SALE',
        'INTERNAL_CONSUMPTION', 'RETURN', 'REFURBISH', 'ADJUSTMENT', 'WRITE_OFF',
        'COUNTER_PURCHASE'
      )
    `);
    await runner.query('CREATE TABLE stock_movements (origin stock_movement_origin NOT NULL)');
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

  it('backfillea consumo, conserva datos y bloquea down con recibos o movimientos', async () => {
    const tenantId = randomUUID();
    const requestId = randomUUID();
    const orderId = randomUUID();
    const movementId = randomUUID();
    await runner.query(
      `INSERT INTO inventory_execution_request_receipts
        (id, tenant_id, inventory_request_id, execution_order_id, aggregate_version,
         outcome, stock_movement_id)
       VALUES ($1, $2, $3, $4, 1, 'CONFIRMED', $5)`,
      [randomUUID(), tenantId, requestId, orderId, movementId],
    );

    await migration141.up(runner);
    const backfilled = (await runner.query(
      `SELECT kind, request_id FROM inventory_execution_request_receipts WHERE tenant_id = $1`,
      [tenantId],
    )) as Array<{ kind: string; request_id: string }>;
    expect(backfilled).toEqual([{ kind: 'CONSUMPTION', request_id: requestId }]);

    await runner.query(
      `INSERT INTO inventory_execution_request_receipts
        (id, tenant_id, kind, request_id, execution_order_id, aggregate_version,
         outcome, stock_movement_id, original_stock_movement_id)
       VALUES ($1, $2, 'REVERSAL', $3, $4, 2, 'CONFIRMED', $5, $6)`,
      [randomUUID(), tenantId, randomUUID(), orderId, randomUUID(), movementId],
    );
    await expect(migration141.down(runner)).rejects.toThrow('recibo(s) REVERSAL');
    await runner.query(`DELETE FROM inventory_execution_request_receipts WHERE kind = 'REVERSAL'`);

    await runner.query(`INSERT INTO stock_movements (origin) VALUES ('EXECUTION_ORDER_REVERSAL')`);
    await expect(migration141.down(runner)).rejects.toThrow('movimiento(s) de reverso');
    await runner.query(`DELETE FROM stock_movements`);

    await migration141.down(runner);
    const oldShape = (await runner.query(
      `
      SELECT column_name
        FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'inventory_execution_request_receipts'
         AND column_name IN ('inventory_request_id', 'kind', 'request_id')
       ORDER BY column_name
    `,
      [schema],
    )) as Array<{ column_name: string }>;
    expect(oldShape).toEqual([{ column_name: 'inventory_request_id' }]);

    const enumLabel = (await runner.query(`
      SELECT e.enumlabel
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'stock_movement_origin'
         AND t.typnamespace = current_schema()::regnamespace
         AND e.enumlabel = 'EXECUTION_ORDER_REVERSAL'
    `)) as Array<{ enumlabel: string }>;
    expect(enumLabel).toHaveLength(1);
  });
});
