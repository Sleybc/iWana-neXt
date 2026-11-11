import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { LegalTextContractTemplate1850000000185 } from './185_legal_text_contract_template';

const SCHEMA = `tenant_legal_contract_185_${randomBytes(5).toString('hex')}`;
const SHA = 'a'.repeat(64);
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const INTEGRATION_DATABASE_NAME = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;

if (dbAvailable && !INTEGRATION_DATABASE_NAME.test(process.env['DB_NAME'] ?? '')) {
  throw new Error('Integración 185: DB_NAME debe ser dbiw, test o iwana_it_*.');
}

const INSERT = `INSERT INTO legal_texts
  (type, version, sha256, content, published_at, format,
   legal_approval_declaration, approved_by_user_id, approved_at)
  VALUES ($1, $2, '${SHA}', 'x', now(), $3, $4, $5, $6)`;

describeWithDb('Migración 185 — plantilla de contrato en textos legales (PostgreSQL real)', () => {
  let dataSource: DataSource | undefined;
  let runner: QueryRunner | undefined;
  const migration = new LegalTextContractTemplate1850000000185();
  const approver = randomUUID();

  function active(): QueryRunner {
    if (!runner) throw new Error('QueryRunner no inicializado.');
    return runner;
  }

  async function rejects(sql: string, params: unknown[] = []): Promise<string> {
    await active().query('SAVEPOINT sp_185');
    try {
      await active().query(sql, params);
    } catch (error) {
      await active().query('ROLLBACK TO SAVEPOINT sp_185');
      return (error as { constraint?: string }).constraint ?? 'error';
    }
    await active().query('RELEASE SAVEPOINT sp_185');
    throw new Error(`Se esperaba rechazo: ${sql}`);
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
    // Estado de legal_texts tras la 146 y la 166 (CHECK de formato sin nombre).
    await runner.query(`
      CREATE TABLE legal_texts (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        type text NOT NULL, version text NOT NULL, sha256 char(64) NOT NULL,
        content text NOT NULL, published_at timestamptz NOT NULL, url text,
        CONSTRAINT pk_legal_texts PRIMARY KEY (id),
        CONSTRAINT ck_legal_texts_type CHECK (type IN ('POLITICA_TRATAMIENTO', 'AVISO_PRIVACIDAD', 'AUTORIZACION')),
        CONSTRAINT uq_legal_texts_type_version UNIQUE (type, version)
      )`);
    await runner.query(
      `ALTER TABLE legal_texts ADD COLUMN format text NOT NULL DEFAULT 'PLAIN' CHECK (format IN ('PLAIN', 'MARKDOWN'))`,
    );
    await runner.query(
      `INSERT INTO legal_texts (type, version, sha256, content, published_at) VALUES ('AUTORIZACION', '1.0', '${SHA}', 'x', now())`,
    );
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

  it('admite el contrato en HTML solo con la declaración, quién y cuándo', async () => {
    await migration.up(active());
    await active().query(INSERT, [
      'CONTRATO_SERVICIO',
      '1.0',
      'HTML',
      'APROBADO_POR_ASESORIA_JURIDICA',
      approver,
      new Date(),
    ]);
    expect(await rejects(INSERT, ['CONTRATO_SERVICIO', '1.1', 'HTML', null, null, null])).toBe(
      'ck_legal_texts_contract_approved',
    );
    expect(
      await rejects(INSERT, [
        'CONTRATO_SERVICIO',
        '1.2',
        'HTML',
        'APROBADO_POR_ASESORIA_JURIDICA',
        null,
        new Date(),
      ]),
    ).toBe('ck_legal_texts_approval_complete');
    expect(
      await rejects(INSERT, ['CONTRATO_SERVICIO', '1.3', 'HTML', 'OTRA', approver, new Date()]),
    ).toBe('ck_legal_texts_approval_declaration');
    expect(
      await rejects(INSERT, [
        'CONTRATO_SERVICIO',
        '1.4',
        'PLAIN',
        'APROBADO_POR_ASESORIA_JURIDICA',
        approver,
        new Date(),
      ]),
    ).toBe('ck_legal_texts_contract_approved');
  });

  it('mantiene HTML exclusivo del contrato y los tipos anteriores sin aprobación', async () => {
    expect(await rejects(INSERT, ['AUTORIZACION', '2.0', 'HTML', null, null, null])).toBe(
      'ck_legal_texts_html_only_contract',
    );
    expect(await rejects(INSERT, ['OTRO', '1.0', 'PLAIN', null, null, null])).toBe(
      'ck_legal_texts_type',
    );
    await active().query(INSERT, ['AVISO_PRIVACIDAD', '1.0', 'MARKDOWN', null, null, null]);
  });

  it('down bloquea con contratos, revierte con la variable destructiva y reaplica', async () => {
    await expect(migration.down(active())).rejects.toThrow(/bloqueado/u);
    process.env['IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN'] = 'true';
    try {
      await migration.down(active());
    } finally {
      delete process.env['IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN'];
    }
    const columns = (await active().query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'legal_texts' AND column_name LIKE 'approv%'`,
      [SCHEMA],
    )) as unknown[];
    expect(columns).toHaveLength(0);
    expect(
      await rejects(
        `INSERT INTO legal_texts (type, version, sha256, content, published_at, format)
         VALUES ('AUTORIZACION', '3.0', '${SHA}', 'x', now(), 'HTML')`,
      ),
    ).toBe('legal_texts_format_check');
    const kept = (await active().query(`SELECT type FROM legal_texts ORDER BY type`)) as unknown[];
    expect(kept).toEqual([{ type: 'AUTORIZACION' }, { type: 'AVISO_PRIVACIDAD' }]);

    await migration.up(active());
    await migration.down(active());
  });
});
