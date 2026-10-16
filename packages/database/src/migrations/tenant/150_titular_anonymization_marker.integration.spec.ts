import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { TitularAnonymizationMarker1500000000000 } from './150_titular_anonymization_marker';

const SCHEMA = `tenant_privacy_marker_150_${randomBytes(5).toString('hex')}`;
const SECOND_SCHEMA = `tenant_privacy_marker_150_other_${randomBytes(5).toString('hex')}`;
const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const INTEGRATION_DATABASE_NAME = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;

if (dbAvailable && !INTEGRATION_DATABASE_NAME.test(process.env['DB_NAME'] ?? '')) {
  throw new Error(
    'Integración 150: DB_NAME debe ser dbiw, test o iwana_it_*; solo crea y limpia un schema efímero.',
  );
}

function requireRunner(runner: QueryRunner | undefined): QueryRunner {
  if (!runner) throw new Error('QueryRunner de integración no inicializado.');
  return runner;
}

async function expectRejectedWrite(
  runner: QueryRunner,
  write: () => Promise<unknown>,
): Promise<void> {
  await runner.query('SAVEPOINT expected_rejection');
  try {
    await expect(write()).rejects.toMatchObject({ code: '55000' });
  } finally {
    await runner.query('ROLLBACK TO SAVEPOINT expected_rejection');
    await runner.query('RELEASE SAVEPOINT expected_rejection');
  }
}

describeWithDb('Migración 150 — marca de anonimización en PostgreSQL real', () => {
  let dataSource: DataSource | undefined;
  let runner: QueryRunner | undefined;
  const migration = new TitularAnonymizationMarker1500000000000();

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      username: credentials.username,
      password: credentials.password,
      database: process.env['DB_NAME'] ?? '',
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
      await bootstrap.query(`CREATE SCHEMA "${SCHEMA}"`);
      await bootstrap.query(`CREATE SCHEMA "${SECOND_SCHEMA}"`);
      await bootstrap.query(`
        CREATE FUNCTION "${SECOND_SCHEMA}".titular_prevent_anonymization_rewrite()
        RETURNS trigger LANGUAGE plpgsql AS $function$
        BEGIN
          RETURN NEW;
        END;
        $function$
      `);
    } finally {
      await bootstrap.release();
    }

    runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    await runner.query(`SET LOCAL search_path TO "${SCHEMA}"`);
    await runner.query(`CREATE TABLE party (id uuid PRIMARY KEY)`);
    await runner.query(`CREATE TABLE subscribers (id uuid PRIMARY KEY)`);
    await runner.query(`CREATE TABLE expediente_records (id uuid PRIMARY KEY)`);
  });

  afterAll(async () => {
    try {
      if (runner && !runner.isReleased) {
        try {
          if (runner.isTransactionActive) await runner.rollbackTransaction();
        } finally {
          await runner.release();
        }
      }
    } finally {
      if (dataSource?.isInitialized) {
        const cleanup = dataSource.createQueryRunner();
        try {
          await cleanup.query(`DROP SCHEMA IF EXISTS "${SECOND_SCHEMA}" CASCADE`);
          await cleanup.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
        } finally {
          await cleanup.release();
          await dataSource.destroy();
        }
      }
    }
  });

  it('aplica marcas emparejadas, impide reescribirlas y revierte/reaplica el DDL', async () => {
    const active = requireRunner(runner);
    await migration.up(active);

    for (const table of ['party', 'subscribers', 'expediente_records']) {
      const columns = (await active.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = $1
           AND column_name IN ('anonymized_at', 'anonymized_request_id')
         ORDER BY column_name`,
        [table],
      )) as Array<{ column_name: string }>;
      expect(columns.map((column) => column.column_name)).toEqual([
        'anonymized_at',
        'anonymized_request_id',
      ]);

      const rowId = randomUUID();
      const requestId = randomUUID();
      await active.query(`INSERT INTO ${table} (id) VALUES ($1)`, [rowId]);
      await active.query(
        `UPDATE ${table} SET anonymized_at = now(), anonymized_request_id = $2 WHERE id = $1`,
        [rowId, requestId],
      );
      await expectRejectedWrite(active, () =>
        active.query(`UPDATE ${table} SET anonymized_request_id = $2 WHERE id = $1`, [
          rowId,
          randomUUID(),
        ]),
      );
      await expectRejectedWrite(active, () =>
        active.query(`UPDATE ${table} SET anonymized_at = NULL WHERE id = $1`, [rowId]),
      );
    }

    const originalFlag = process.env[DESTRUCTIVE_DOWN_ENV_VAR];
    delete process.env[DESTRUCTIVE_DOWN_ENV_VAR];
    await expect(migration.down(active)).rejects.toThrow(
      /IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true/,
    );
    process.env[DESTRUCTIVE_DOWN_ENV_VAR] = 'true';
    try {
      await migration.down(active);
    } finally {
      if (originalFlag === undefined) delete process.env[DESTRUCTIVE_DOWN_ENV_VAR];
      else process.env[DESTRUCTIVE_DOWN_ENV_VAR] = originalFlag;
    }
    const remainingColumns = (await active.query(
      `SELECT table_name FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND column_name IN ('anonymized_at', 'anonymized_request_id')`,
    )) as Array<{ table_name: string }>;
    expect(remainingColumns).toEqual([]);

    await migration.up(active);
    const schemasWithFunction = (await active.query(
      `SELECT count(*)::int AS count FROM pg_proc
       WHERE proname = 'titular_prevent_anonymization_rewrite'
         AND pronamespace IN (to_regnamespace($1), to_regnamespace($2))`,
      [SCHEMA, SECOND_SCHEMA],
    )) as Array<{ count: number }>;
    expect(schemasWithFunction[0]?.count).toBe(2);
    const remainingFunction = (await active.query(
      `SELECT 1 FROM pg_proc
       WHERE proname = 'titular_prevent_anonymization_rewrite'
         AND pronamespace = to_regnamespace(current_schema())`,
    )) as Array<{ '?column?': number }>;
    expect(remainingFunction).toHaveLength(1);
  });
});
