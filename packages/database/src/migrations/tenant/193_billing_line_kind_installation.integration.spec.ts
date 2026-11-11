import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { BillingLineKindInstallation1930000000193 } from './193_billing_line_kind_installation';

/**
 * Migración 193 — tipo de línea INSTALACION en PostgreSQL real: up admite el tipo, down restaura
 * el CHECK de 173 con guarda destructiva si hay líneas de instalación, y reaplicación.
 */
const SCHEMA = `tenant_line_kind_${randomBytes(5).toString('hex')}`;
const DESTRUCTIVE = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const INTEGRATION_DATABASE_NAME = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;

if (dbAvailable && !INTEGRATION_DATABASE_NAME.test(process.env['DB_NAME'] ?? '')) {
  throw new Error('Integración 193: DB_NAME debe ser dbiw, test o iwana_it_*.');
}

describeWithDb('Migración 193 — tipo de línea INSTALACION en PostgreSQL real', () => {
  let dataSource: DataSource | undefined;
  let runner: QueryRunner | undefined;
  const m193 = new BillingLineKindInstallation1930000000193();

  function qr(): QueryRunner {
    if (!runner) throw new Error('QueryRunner no inicializado.');
    return runner;
  }

  const insertLine = (kind: string) =>
    qr().query(`INSERT INTO billing_document_lines (id, kind) VALUES ($1, $2)`, [
      randomUUID(),
      kind,
    ]);

  async function rejects(work: () => Promise<unknown>): Promise<void> {
    await qr().query('SAVEPOINT probe');
    await expect(work()).rejects.toThrow(/billing_document_lines_kind_check/u);
    await qr().query('ROLLBACK TO SAVEPOINT probe');
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
    // Mismo CHECK en línea que crea la 173 (nombre generado por PostgreSQL).
    await runner.query(`
      CREATE TABLE billing_document_lines (
        id uuid PRIMARY KEY,
        kind varchar(16) NOT NULL CHECK (kind IN ('PLAN','ADICIONAL','PRORRATEO')))`);
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

  it('antes de la 193 el CHECK rechaza INSTALACION; después lo admite', async () => {
    await rejects(() => insertLine('INSTALACION'));
    await m193.up(qr());
    await insertLine('INSTALACION');
    await insertLine('PLAN');
    await rejects(() => insertLine('OTRO'));
  });

  it('down sin el flag aborta si hay líneas de instalación y no toca el schema', async () => {
    await expect(m193.down(qr())).rejects.toThrow(DESTRUCTIVE);
    const [row] = (await qr().query(
      `SELECT COUNT(*)::int AS count FROM billing_document_lines WHERE kind = 'INSTALACION'`,
    )) as Array<{ count: number }>;
    expect(row?.count).toBe(1);
  });

  it('down con el flag borra las líneas de instalación y restaura el CHECK; up reaplica', async () => {
    process.env[DESTRUCTIVE] = 'true';
    try {
      await m193.down(qr());
    } finally {
      delete process.env[DESTRUCTIVE];
    }
    const kinds = (await qr().query(`SELECT kind FROM billing_document_lines`)) as Array<{
      kind: string;
    }>;
    expect(kinds.map(({ kind }) => kind)).toEqual(['PLAN']);
    await rejects(() => insertLine('INSTALACION'));
    // Sin líneas de instalación el down no exige el flag.
    await m193.up(qr());
    await m193.down(qr());
    await m193.up(qr());
    await insertLine('INSTALACION');
  });
});
