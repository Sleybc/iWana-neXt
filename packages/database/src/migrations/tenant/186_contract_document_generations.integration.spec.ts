import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { ContractDocumentGenerations1860000000186 } from './186_contract_document_generations';

const SCHEMA = `tenant_contract_docs_186_${randomBytes(5).toString('hex')}`;
const TENANT_ID = randomUUID();
const CONTRACT_ID = randomUUID();
const ACTOR_ID = randomUUID();
const SHA = 'a'.repeat(64);
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const INTEGRATION_DATABASE_NAME = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;

if (dbAvailable && !INTEGRATION_DATABASE_NAME.test(process.env['DB_NAME'] ?? '')) {
  throw new Error('Integración 186: DB_NAME debe ser dbiw, test o iwana_it_*.');
}

const INSERT = `INSERT INTO contract_document_generations
  (tenant_id, contract_id, requested_by, status, failure_reason, missing_operator_fields,
   snapshot_encrypted, snapshot_sha256, template_legal_text_id, template_version,
   document_object_key, document_sha256, completed_at)
  VALUES ($1, $2, $3, $4, $5, $6::text[], $7, $8, $9, $10, $11, $12, $13)`;

interface Row {
  status: string;
  failureReason?: string | null;
  missing?: string[];
  snapshot?: boolean;
  ready?: boolean;
  completed?: boolean;
}

function params(row: Row): unknown[] {
  return [
    TENANT_ID,
    CONTRACT_ID,
    ACTOR_ID,
    row.status,
    row.failureReason ?? null,
    row.missing ?? [],
    row.snapshot ? 'cifrado' : null,
    row.snapshot ? SHA : null,
    row.ready ? randomUUID() : null,
    row.ready ? '1.0' : null,
    row.ready ? 'tenant/contracts/k.pdf.enc' : null,
    row.ready ? 'b'.repeat(64) : null,
    row.completed ? new Date() : null,
  ];
}

describeWithDb('Migración 186 — generaciones del PDF del contrato en PostgreSQL real', () => {
  let dataSource: DataSource | undefined;
  let runner: QueryRunner | undefined;
  const migration = new ContractDocumentGenerations1860000000186();

  function active(): QueryRunner {
    if (!runner) throw new Error('QueryRunner no inicializado.');
    return runner;
  }

  async function rejects(row: Row): Promise<string> {
    await active().query('SAVEPOINT sp_186');
    try {
      await active().query(INSERT, params(row));
    } catch (error) {
      await active().query('ROLLBACK TO SAVEPOINT sp_186');
      return (error as { constraint?: string }).constraint ?? 'error';
    }
    await active().query('RELEASE SAVEPOINT sp_186');
    throw new Error(`Se esperaba rechazo: ${JSON.stringify(row)}`);
  }

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
    await dataSource.query(`CREATE SCHEMA "${SCHEMA}"`);
    runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    await runner.query(`SET LOCAL search_path TO "${SCHEMA}"`);
    // Mínimo de la tabla referenciada; sus demás columnas no intervienen.
    await runner.query(`CREATE TABLE contracts (id uuid PRIMARY KEY)`);
    await runner.query(`INSERT INTO contracts (id) VALUES ($1)`, [CONTRACT_ID]);
  });

  afterAll(async () => {
    try {
      if (runner && !runner.isReleased) {
        if (runner.isTransactionActive) await runner.rollbackTransaction();
        await runner.release();
      }
    } finally {
      if (dataSource?.isInitialized) {
        await dataSource.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
        await dataSource.destroy();
      }
    }
  });

  it('acepta PENDING, READY y FAILED válidos y aplica la unicidad por versión activa', async () => {
    await migration.up(active());
    await active().query(INSERT, params({ status: 'PENDING', snapshot: true }));
    expect(await rejects({ status: 'PENDING', snapshot: true })).toBe(
      'uq_cdg_contract_snapshot_active',
    );
    await active().query(
      INSERT,
      params({
        status: 'FAILED',
        failureReason: 'OPERATOR_DATA_MISSING',
        missing: ['nit'],
        completed: true,
      }),
    );
    await active().query(INSERT, params({ status: 'READY', ready: true, completed: true }));
  });

  it('rechaza estados incoherentes con el contrato compartido', async () => {
    expect(await rejects({ status: 'OTRO' })).toBe('chk_cdg_status');
    expect(await rejects({ status: 'READY', completed: true })).toBe('chk_cdg_ready');
    expect(await rejects({ status: 'FAILED', completed: true })).toBe('chk_cdg_failed');
    expect(await rejects({ status: 'FAILED', failureReason: 'RENDER_FAILED' })).toBe(
      'chk_cdg_failed',
    );
    expect(await rejects({ status: 'FAILED', failureReason: 'NO_EXISTE', completed: true })).toBe(
      'chk_cdg_failure_reason',
    );
    expect(
      await rejects({ status: 'FAILED', failureReason: 'OPERATOR_DATA_MISSING', completed: true }),
    ).toBe('chk_cdg_missing_fields');
    expect(await rejects({ status: 'PENDING' })).toBe('chk_cdg_pending_snapshot');
  });

  it('down bloquea con datos, revierte con la variable destructiva y se puede reaplicar', async () => {
    await expect(migration.down(active())).rejects.toThrow(/bloqueado/u);
    process.env['IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN'] = 'true';
    try {
      await migration.down(active());
    } finally {
      delete process.env['IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN'];
    }
    const gone = (await active().query(
      `SELECT to_regclass('contract_document_generations') IS NULL AS absent`,
    )) as Array<{ absent: boolean }>;
    expect(gone[0]?.absent).toBe(true);
    await migration.up(active());
    await migration.down(active());
  });
});
