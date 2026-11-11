import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { ContractAutoCreationFromExpediente1920000000192 } from './192_contract_auto_creation_from_expediente';

/**
 * Migración 192 — contrato automático desde la oportunidad (fase 2, A+B) en PostgreSQL real:
 * columnas, índice único parcial por expediente de origen, CHECK del aviso y down con guarda
 * destructiva y reaplicación.
 */
const SCHEMA = `tenant_auto_contract_${randomBytes(5).toString('hex')}`;
const TENANT_ID = randomUUID();
const SUBSCRIBER = randomUUID();
const EXPEDIENTE = randomUUID();
const DESTRUCTIVE = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const INTEGRATION_DATABASE_NAME = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;

if (dbAvailable && !INTEGRATION_DATABASE_NAME.test(process.env['DB_NAME'] ?? '')) {
  throw new Error('Integración 192: DB_NAME debe ser dbiw, test o iwana_it_*.');
}

describeWithDb('Migración 192 — contrato automático por expediente en PostgreSQL real', () => {
  let dataSource: DataSource | undefined;
  let runner: QueryRunner | undefined;
  const m192 = new ContractAutoCreationFromExpediente1920000000192();

  function qr(): QueryRunner {
    if (!runner) throw new Error('QueryRunner no inicializado.');
    return runner;
  }

  async function columnExists(table: string, name: string): Promise<boolean> {
    const rows = (await qr().query(
      `SELECT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2) AS present`,
      [table, name],
    )) as Array<{ present: boolean }>;
    return rows[0]?.present === true;
  }

  async function insertContract(sourceExpedienteId: string | null, deletedAt: string | null) {
    await qr().query(
      `INSERT INTO contracts (id, tenant_id, subscriber_id, source_expediente_id, deleted_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), TENANT_ID, SUBSCRIBER, sourceExpedienteId, deletedAt],
    );
  }

  /** Ejecuta la sentencia en un savepoint para que un rechazo no aborte la transacción. */
  async function sqlstateOf(work: () => Promise<unknown>): Promise<string> {
    await qr().query('SAVEPOINT sp_192');
    try {
      await work();
    } catch (error) {
      await qr().query('ROLLBACK TO SAVEPOINT sp_192');
      return (error as { code?: string }).code ?? 'sin-codigo';
    }
    await qr().query('RELEASE SAVEPOINT sp_192');
    return 'aceptado';
  }

  async function destructive(work: () => Promise<void>): Promise<void> {
    process.env[DESTRUCTIVE] = 'true';
    try {
      await work();
    } finally {
      delete process.env[DESTRUCTIVE];
    }
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
    // Mínimo de las tablas que toca la 192; sus demás columnas no intervienen.
    await runner.query(`CREATE TABLE subscribers (id uuid PRIMARY KEY)`);
    await runner.query(`
      CREATE TABLE contracts (
        id uuid PRIMARY KEY, tenant_id uuid NOT NULL, subscriber_id uuid NOT NULL,
        deleted_at timestamptz NULL)`);
    await runner.query(`INSERT INTO subscribers (id) VALUES ($1)`, [SUBSCRIBER]);
  });

  afterAll(async () => {
    delete process.env[DESTRUCTIVE];
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

  it('up: agrega las columnas nulas y es idempotente', async () => {
    await m192.up(qr());
    await m192.up(qr());
    expect(await columnExists('contracts', 'source_expediente_id')).toBe(true);
    expect(await columnExists('subscribers', 'contract_auto_creation_issue')).toBe(true);
  });

  it('índice único parcial: un contrato vivo por expediente; manuales y borrados no cuentan', async () => {
    await insertContract(EXPEDIENTE, null);
    expect(await sqlstateOf(() => insertContract(EXPEDIENTE, null))).toBe('23505');
    expect(await sqlstateOf(() => insertContract(EXPEDIENTE, '2026-11-11T00:00:00Z'))).toBe(
      'aceptado',
    );
    expect(await sqlstateOf(() => insertContract(null, null))).toBe('aceptado');
    expect(await sqlstateOf(() => insertContract(null, null))).toBe('aceptado');
  });

  it('CHECK del aviso: exige objeto con missing en arreglo', async () => {
    const set = (value: string) =>
      qr().query(`UPDATE subscribers SET contract_auto_creation_issue = $1::jsonb WHERE id = $2`, [
        value,
        SUBSCRIBER,
      ]);
    expect(await sqlstateOf(() => set('{"missing":"PLAN"}'))).toBe('23514');
    expect(await sqlstateOf(() => set('["PLAN"]'))).toBe('23514');
    expect(await sqlstateOf(() => set('{"reason":"MISSING_DATA","missing":["PLAN"]}'))).toBe(
      'aceptado',
    );
  });

  it('down sin la variable: bloqueado con origen o aviso; sin ellos procede', async () => {
    await expect(m192.down(qr())).rejects.toThrow(/bloqueado/u);
    expect(await columnExists('contracts', 'source_expediente_id')).toBe(true);

    await qr().query(`UPDATE contracts SET source_expediente_id = NULL`);
    await expect(m192.down(qr())).rejects.toThrow(/0 contrato\(s\).*1 aviso\(s\)/su);

    await qr().query(`UPDATE subscribers SET contract_auto_creation_issue = NULL`);
    await m192.down(qr());
    expect(await columnExists('contracts', 'source_expediente_id')).toBe(false);
    expect(await columnExists('subscribers', 'contract_auto_creation_issue')).toBe(false);
  });

  it('down con la variable y datos: retira columnas e índice; la 192 se reaplica', async () => {
    await m192.up(qr());
    await insertContract(EXPEDIENTE, null);
    await destructive(() => m192.down(qr()));
    expect(await columnExists('contracts', 'source_expediente_id')).toBe(false);
    const index = (await qr().query(
      `SELECT to_regclass('uq_contracts_source_expediente') IS NULL AS gone`,
    )) as Array<{ gone: boolean }>;
    expect(index[0]?.gone).toBe(true);

    await m192.up(qr());
    expect(await columnExists('contracts', 'source_expediente_id')).toBe(true);
  });
});
