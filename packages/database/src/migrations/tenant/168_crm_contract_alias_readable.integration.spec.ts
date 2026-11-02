import { randomBytes } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';
import { resolveMigrationDbCredentials } from '../../db-credentials';
import { CrmContractAliasReadable1680000000000 } from './168_crm_contract_alias_readable';

const schema = `tenant_alias_168_${randomBytes(4).toString('hex')}`;
const databaseAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = databaseAvailable ? describe : describe.skip;
const safeDatabaseName = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;

if (databaseAvailable && !safeDatabaseName.test(process.env['DB_NAME'] ?? '')) {
  throw new Error(
    'Integración 168: DB_NAME debe ser dbiw, test o iwana_it_*; solo crea y limpia un schema efímero.',
  );
}

describeWithDb('Migración 168 — alias legibles en PostgreSQL real', () => {
  let dataSource: DataSource | undefined;
  let runner: QueryRunner | undefined;
  const migration = new CrmContractAliasReadable1680000000000();

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
      await bootstrap.query(
        `CREATE TABLE contracts (id uuid PRIMARY KEY, alias varchar(120) NOT NULL, updated_at timestamptz NOT NULL DEFAULT '2026-01-01T00:00:00Z')`,
      );
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

  it('vuelve legibles solo los alias autogenerados y el down restaura los originales', async () => {
    if (!runner) throw new Error('QueryRunner de integración no inicializado.');
    const rows: Array<[string, string]> = [
      ['00000000-0000-4000-8000-000000000001', 'Servicio — EL_COLEGIO CR 2 2 02'],
      ['00000000-0000-4000-8000-000000000002', 'Servicio — Bogotá Cra 10'],
      ['00000000-0000-4000-8000-000000000003', 'MI_SEDE PROPIA'],
    ];
    for (const [id, alias] of rows) {
      await runner.query('INSERT INTO contracts (id, alias) VALUES ($1, $2)', [id, alias]);
    }
    const read = async () =>
      (await runner!.query('SELECT id, alias, updated_at FROM contracts ORDER BY id')) as Array<{
        id: string;
        alias: string;
        updated_at: Date;
      }>;

    await migration.up(runner);
    const after = await read();
    expect(after.map((row) => row.alias)).toEqual([
      'Servicio — El Colegio Cr 2 2 02',
      'Servicio — Bogotá Cra 10',
      'MI_SEDE PROPIA',
    ]);
    expect(after[0]!.updated_at.toISOString()).not.toBe('2026-01-01T00:00:00.000Z');
    expect(after[1]!.updated_at.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(after[2]!.updated_at.toISOString()).toBe('2026-01-01T00:00:00.000Z');

    await migration.down(runner);
    expect((await read()).map((row) => row.alias)).toEqual(rows.map(([, alias]) => alias));
    const backup = (await runner.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = current_schema() AND table_name = 'crm_contract_alias_backup_168'`,
    )) as unknown[];
    expect(backup).toEqual([]);
  });
});
