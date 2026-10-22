import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { EnableBtreeGist1784419216000 } from './028_enable_btree_gist';

const DB_AVAILABLE = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = DB_AVAILABLE ? describe : describe.skip;
const INTEGRATION_DATABASE_NAME = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;

if (DB_AVAILABLE && !INTEGRATION_DATABASE_NAME.test(process.env['DB_NAME'] ?? '')) {
  throw new Error(
    'Integración 028: DB_NAME debe ser dbiw, test o iwana_it_*; instala una extensión global sin tocar schemas tenant.',
  );
}

function requireRunner(runner: QueryRunner | undefined): QueryRunner {
  if (!runner) throw new Error('QueryRunner de integración no inicializado.');
  return runner;
}

describeWithDb('Migración pública 028 — btree_gist en PostgreSQL real', () => {
  let dataSource: DataSource | undefined;
  let runner: QueryRunner | undefined;
  const migration = new EnableBtreeGist1784419216000();

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
      extra: { max: 2, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();
    runner = dataSource.createQueryRunner();
    await runner.connect();
  });

  afterAll(async () => {
    try {
      if (runner && !runner.isReleased) await runner.release();
    } finally {
      if (dataSource?.isInitialized) await dataSource.destroy();
    }
  });

  it('instala btree_gist y conserva la extensión al revertir', async () => {
    const active = requireRunner(runner);
    const available = (await active.query(
      `SELECT default_version, installed_version
       FROM pg_available_extensions
       WHERE name = 'btree_gist'`,
    )) as Array<{ default_version: string; installed_version: string | null }>;
    expect(available).toHaveLength(1);
    expect(available[0]?.default_version).toMatch(/^\d+(?:\.\d+)*$/u);

    await migration.up(active);
    const installed = (await active.query(
      `SELECT extname, extversion FROM pg_extension WHERE extname = 'btree_gist'`,
    )) as Array<{ extname: string; extversion: string }>;
    expect(installed).toHaveLength(1);
    expect(installed[0]?.extversion).toMatch(/^\d+(?:\.\d+)*$/u);

    await migration.down(active);
    await expect(
      active.query(`SELECT extname FROM pg_extension WHERE extname = 'btree_gist'`),
    ).resolves.toEqual([{ extname: 'btree_gist' }]);
  });
});
