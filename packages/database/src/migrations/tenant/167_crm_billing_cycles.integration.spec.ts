import { randomBytes } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';
import { resolveMigrationDbCredentials } from '../../db-credentials';
import { CreateCrmBillingCycles1670000000000 } from './167_crm_billing_cycles';

const schema = `tenant_billing_cycles_167_${randomBytes(4).toString('hex')}`;
const databaseAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = databaseAvailable ? describe : describe.skip;
const safeDatabaseName = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;

if (databaseAvailable && !safeDatabaseName.test(process.env['DB_NAME'] ?? '')) {
  throw new Error(
    'Integración 167: DB_NAME debe ser dbiw, test o iwana_it_*; solo crea y limpia un schema efímero.',
  );
}

describeWithDb('Migración 167 — ciclos de facturación en PostgreSQL real', () => {
  let dataSource: DataSource | undefined;
  let runner: QueryRunner | undefined;
  const migration = new CreateCrmBillingCycles1670000000000();

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      username: credentials.username,
      password: credentials.password,
      database: process.env['DB_NAME'] ?? 'dbiw',
      entities: [],
      migrations: [],
      synchronize: false,
      logging: false,
    });
    await dataSource.initialize();
    const bootstrap = dataSource.createQueryRunner();
    try {
      await bootstrap.query(`CREATE SCHEMA "${schema}"`);
      await bootstrap.query(`SET search_path TO "${schema}"`);
      await bootstrap.query(`CREATE TABLE contracts (id uuid PRIMARY KEY, status text NOT NULL)`);
    } finally {
      await bootstrap.release();
    }
    runner = dataSource.createQueryRunner();
    await runner.query(`SET search_path TO "${schema}"`);
  });

  afterAll(async () => {
    try {
      if (runner && !runner.isReleased) await runner.release();
    } finally {
      if (dataSource?.isInitialized) {
        const cleanup = dataSource.createQueryRunner();
        try {
          await cleanup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        } finally {
          await cleanup.release();
          await dataSource.destroy();
        }
      }
    }
  });

  it('siembra el catálogo del tenant y revierte las tablas y columnas creadas', async () => {
    if (!runner) throw new Error('QueryRunner de integración no inicializado.');
    await migration.up(runner);

    const cycles = (await runner.query(
      'SELECT cycle_day, cutoff_day, active FROM crm_billing_cycles ORDER BY cycle_day',
    )) as Array<{ cycle_day: number; cutoff_day: number; active: boolean }>;
    expect(cycles).toEqual([
      { cycle_day: 1, cutoff_day: 15, active: true },
      { cycle_day: 15, cutoff_day: 30, active: true },
    ]);
    const column = (await runner.query(
      `SELECT is_nullable FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'contracts'
         AND column_name = 'billing_cycle_day'`,
    )) as Array<{ is_nullable: string }>;
    expect(column).toEqual([{ is_nullable: 'YES' }]);

    await migration.down(runner);
    const remaining = (await runner.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = current_schema() AND table_name = 'crm_billing_cycles'`,
    )) as unknown[];
    const billingColumn = (await runner.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'contracts'
         AND column_name = 'billing_cycle_day'`,
    )) as unknown[];
    expect(remaining).toEqual([]);
    expect(billingColumn).toEqual([]);
  });
});
