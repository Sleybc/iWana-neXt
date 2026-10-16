import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { PrivacyErasureRecord1490000000000 } from './149_privacy_erasure_record';

const SCHEMA = `tenant_erasure_${randomBytes(5).toString('hex')}`;
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const INTEGRATION_DATABASE_NAME = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;

if (dbAvailable && !INTEGRATION_DATABASE_NAME.test(process.env['DB_NAME'] ?? '')) {
  throw new Error(
    'Integración 149: DB_NAME debe ser dbiw, test o iwana_it_*; solo se crean y limpian schemas efímeros.',
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
    await expect(write()).rejects.toThrow();
  } finally {
    await runner.query('ROLLBACK TO SAVEPOINT expected_rejection');
    await runner.query('RELEASE SAVEPOINT expected_rejection');
  }
}

describeWithDb('Migración 149 — registro de supresión en PostgreSQL real', () => {
  let dataSource: DataSource | undefined;
  let runner: QueryRunner | undefined;
  const migration = new PrivacyErasureRecord1490000000000();
  const requestId = randomUUID();

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
    } finally {
      await bootstrap.release();
    }

    runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    await runner.query(`SET LOCAL search_path TO "${SCHEMA}"`);

    await runner.query(`
      CREATE TABLE data_subject_requests (
        id uuid PRIMARY KEY,
        party_id uuid,
        requester_document_hmac text,
        kind text NOT NULL,
        "right" text NOT NULL,
        status text NOT NULL,
        received_at timestamptz NOT NULL,
        due_at date NOT NULL,
        response_text text
      )
    `);
    await runner.query(
      `INSERT INTO data_subject_requests
        (id, kind, "right", status, received_at, due_at)
       VALUES ($1, 'RECLAMO', 'SUPRIMIR', 'RESUELTA', now(), CURRENT_DATE)`,
      [requestId],
    );
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
          await cleanup.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
        } finally {
          await cleanup.release();
          await dataSource.destroy();
        }
      }
    }
  });

  it('ejecuta up, aplica checks y trigger, revierte y vuelve a aplicar', async () => {
    const active = requireRunner(runner);
    await migration.up(active);

    const columns = (await active.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'data_subject_requests'
        AND column_name IN ('erased_at', 'erasure_categories')
    `)) as Array<{ column_name: string }>;
    expect(columns.map((row) => row.column_name).sort()).toEqual([
      'erased_at',
      'erasure_categories',
    ]);

    await active.query(
      `UPDATE data_subject_requests
       SET erased_at = now(), erasure_categories = $2 WHERE id = $1`,
      [requestId, ['IDENTIFICACION', 'OPERACION_CAMPO']],
    );

    await expectRejectedWrite(active, () =>
      active.query(
        `UPDATE data_subject_requests SET erased_at = '2026-10-17T00:00:00Z' WHERE id = $1`,
        [requestId],
      ),
    );
    await expectRejectedWrite(active, () =>
      active.query(`UPDATE data_subject_requests SET erasure_categories = '{}' WHERE id = $1`, [
        requestId,
      ]),
    );
    await active.query(`UPDATE data_subject_requests SET response_text = $2 WHERE id = $1`, [
      requestId,
      'Nota operativa sin dato personal.',
    ]);

    const otherId = randomUUID();
    await active.query(
      `INSERT INTO data_subject_requests
        (id, kind, "right", status, received_at, due_at)
       VALUES ($1, 'CONSULTA', 'CONOCER', 'RESUELTA', now(), CURRENT_DATE)`,
      [otherId],
    );
    await expectRejectedWrite(active, () =>
      active.query(`UPDATE data_subject_requests SET erased_at = now() WHERE id = $1`, [otherId]),
    );
    await expectRejectedWrite(active, () =>
      active.query(`UPDATE data_subject_requests SET erasure_categories = $2 WHERE id = $1`, [
        otherId,
        ['CONTACTO'],
      ]),
    );
    await expectRejectedWrite(active, () =>
      active.query(`UPDATE data_subject_requests SET erasure_categories = $2 WHERE id = $1`, [
        requestId,
        ['OTRA'],
      ]),
    );

    await migration.down(active);
    const afterDown = (await active.query(`
      SELECT COUNT(*)::int AS count FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'data_subject_requests'
        AND column_name IN ('erased_at', 'erasure_categories')
    `)) as Array<{ count: number }>;
    expect(afterDown[0]?.count).toBe(0);

    await migration.up(active);
    const afterUp = (await active.query(`
      SELECT COUNT(*)::int AS count FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'data_subject_requests'
        AND column_name IN ('erased_at', 'erasure_categories')
    `)) as Array<{ count: number }>;
    expect(afterUp[0]?.count).toBe(2);
  });
});
