import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { ContractPermanence1830000000183 } from './183_contract_permanence';
import { ContractDocumentGenerations1860000000186 } from './186_contract_document_generations';
import { ContractSignatures1880000000188 } from './188_contract_signatures';
import { ContractSignatureCopyEmail1890000000189 } from './189_contract_signature_copy_email';
import { ContractTemplateContentHash1900000000190 } from './190_contract_template_content_hash';

/**
 * up/down de las migraciones del cierre de venta sin integración propia (183, 188, 189, 190):
 * reversibles en vacío, bloqueadas con datos salvo la variable destructiva y reaplicables.
 */
const SCHEMA = `tenant_contract_closing_${randomBytes(5).toString('hex')}`;
const TENANT_ID = randomUUID();
const CONTRACT_ID = randomUUID();
const ACTOR_ID = randomUUID();
const DESTRUCTIVE = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const INTEGRATION_DATABASE_NAME = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;

if (dbAvailable && !INTEGRATION_DATABASE_NAME.test(process.env['DB_NAME'] ?? '')) {
  throw new Error('Integración cierre de venta: DB_NAME debe ser dbiw, test o iwana_it_*.');
}

describeWithDb('Migraciones 183, 188, 189 y 190 — up/down en PostgreSQL real', () => {
  let dataSource: DataSource | undefined;
  let runner: QueryRunner | undefined;
  const m183 = new ContractPermanence1830000000183();
  const m186 = new ContractDocumentGenerations1860000000186();
  const m188 = new ContractSignatures1880000000188();
  const m189 = new ContractSignatureCopyEmail1890000000189();
  const m190 = new ContractTemplateContentHash1900000000190();

  function qr(): QueryRunner {
    if (!runner) throw new Error('QueryRunner no inicializado.');
    return runner;
  }

  async function truthy(sql: string, params: unknown[] = []): Promise<boolean> {
    const rows = (await qr().query(sql, params)) as Array<{ present: boolean }>;
    return rows[0]?.present === true;
  }

  const tableGone = (table: string) => truthy(`SELECT to_regclass($1) IS NULL AS present`, [table]);
  const column = (table: string, name: string) =>
    truthy(
      `SELECT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2) AS present`,
      [table, name],
    );

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
    // Mínimo de las tablas referenciadas; sus demás columnas no intervienen.
    await runner.query(`CREATE TABLE contracts (id uuid PRIMARY KEY)`);
    await runner.query(`CREATE TABLE plan_details (id uuid PRIMARY KEY)`);
    await runner.query(`INSERT INTO contracts (id) VALUES ($1)`, [CONTRACT_ID]);
    await runner.query(`INSERT INTO plan_details (id) VALUES ($1)`, [randomUUID()]);
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

  it('183: down en vacío, bloqueo con permanencia o cargo y reversión destructiva', async () => {
    await m183.up(qr());
    await m183.down(qr());
    expect(await tableGone('contract_permanence')).toBe(true);
    expect(await column('plan_details', 'connection_fee')).toBe(false);

    await m183.up(qr());
    await qr().query(`UPDATE plan_details SET connection_fee = 100000`);
    await expect(m183.down(qr())).rejects.toThrow(/bloqueado/u);
    await qr().query(`UPDATE plan_details SET connection_fee = 0`);
    await qr().query(
      `INSERT INTO contract_permanence (contract_id, tenant_id, accepted, created_by, updated_by)
       VALUES ($1, $2, false, $3, $3)`,
      [CONTRACT_ID, TENANT_ID, ACTOR_ID],
    );
    await expect(m183.down(qr())).rejects.toThrow(/bloqueado/u);
    await destructive(() => m183.down(qr()));
    expect(await tableGone('contract_permanence')).toBe(true);
    await m183.up(qr());
  });

  it('188 y 189: down en vacío, bloqueo con datos y reaplicación', async () => {
    await m186.up(qr());
    await m188.up(qr());
    await m189.up(qr());
    await m189.down(qr());
    expect(await column('contract_signatures', 'copy_email_status')).toBe(false);
    await m188.down(qr());
    expect(await tableGone('contract_signatures')).toBe(true);

    await m188.up(qr());
    await m189.up(qr());
    await qr().query(
      `INSERT INTO contract_activation_events (id, tenant_id, contract_id, source, envelope)
       VALUES ($1, $2, $3, 'MANUAL', '{}'::jsonb)`,
      [randomUUID(), TENANT_ID, CONTRACT_ID],
    );
    await expect(m188.down(qr())).rejects.toThrow(/bloqueado/u);
    await m189.down(qr());
    await m189.up(qr());
    expect(await column('contract_signatures', 'copy_email_status')).toBe(true);
    await m189.down(qr());
    await destructive(() => m188.down(qr()));
    expect(await tableGone('contract_activation_events')).toBe(true);
  });

  it('190: formato de la huella, bloqueo con datos y reaplicación', async () => {
    await m190.up(qr());
    expect(await column('contract_document_generations', 'template_sha256')).toBe(true);
    const insert = `INSERT INTO contract_document_generations
        (tenant_id, contract_id, requested_by, status, snapshot_encrypted, snapshot_sha256,
         template_sha256)
      VALUES ($1, $2, $3, 'PENDING', 'cifrado', $4, $5)`;
    await qr().query('SAVEPOINT sp_190');
    await expect(
      qr().query(insert, [TENANT_ID, CONTRACT_ID, ACTOR_ID, 'a'.repeat(64), 'no-hex']),
    ).rejects.toMatchObject({ constraint: 'chk_cdg_template_sha256' });
    await qr().query('ROLLBACK TO SAVEPOINT sp_190');
    await m190.down(qr());
    expect(await column('contract_document_generations', 'template_sha256')).toBe(false);

    await m190.up(qr());
    await qr().query(insert, [TENANT_ID, CONTRACT_ID, ACTOR_ID, 'a'.repeat(64), 'c'.repeat(64)]);
    await expect(m190.down(qr())).rejects.toThrow(/bloqueado/u);
    await destructive(() => m190.down(qr()));
    expect(await column('contract_document_generations', 'template_sha256')).toBe(false);
    await m190.up(qr());
  });
});
