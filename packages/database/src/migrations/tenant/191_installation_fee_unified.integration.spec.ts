import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { ContractPermanence1830000000183 } from './183_contract_permanence';
import { InstallationFeeUnified1910000000191 } from './191_installation_fee_unified';

/**
 * Migración 191 — cargo de instalación unificado (fase 2, C+E; CA-6 y CA-7) en PostgreSQL real:
 * respaldo de connection_fee con la marca de diferencia, relleno del valor congelado en
 * contratos en borrador, retiro de la columna, down con guarda destructiva y reaplicación.
 */
const SCHEMA = `tenant_install_fee_${randomBytes(5).toString('hex')}`;
const TENANT_ID = randomUUID();
const PLAN_SAME = randomUUID();
const PLAN_DIFF = randomUUID();
const PLAN_ZERO = randomUUID();
const SUB_PYME = randomUUID();
const SUB_RES = randomUUID();
const C_DRAFT_OWN = randomUUID();
const C_DRAFT_SUB = randomUUID();
const C_ACTIVE = randomUUID();
const C_LEGACY = randomUUID();
const DESTRUCTIVE = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const INTEGRATION_DATABASE_NAME = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;

if (dbAvailable && !INTEGRATION_DATABASE_NAME.test(process.env['DB_NAME'] ?? '')) {
  throw new Error('Integración 191: DB_NAME debe ser dbiw, test o iwana_it_*.');
}

describeWithDb('Migración 191 — installation_fee unificado en PostgreSQL real', () => {
  let dataSource: DataSource | undefined;
  let runner: QueryRunner | undefined;
  const m183 = new ContractPermanence1830000000183();
  const m191 = new InstallationFeeUnified1910000000191();

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

  async function fees(): Promise<Record<string, string | null>> {
    const rows = (await qr().query(`SELECT id, installation_fee FROM contracts`)) as Array<{
      id: string;
      installation_fee: string | null;
    }>;
    return Object.fromEntries(rows.map((row) => [row.id, row.installation_fee]));
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
    // Mínimo de las tablas que lee la 191; sus demás columnas no intervienen.
    await runner.query(`CREATE TABLE catalog_items (id uuid PRIMARY KEY, tenant_id uuid NOT NULL)`);
    await runner.query(`
      CREATE TABLE catalog_price_history (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        item_id uuid NOT NULL, tenant_id uuid NOT NULL,
        customer_segment varchar(30) NOT NULL,
        installation_fee numeric(14,2) NOT NULL DEFAULT 0,
        is_current boolean NOT NULL DEFAULT true)`);
    await runner.query(`CREATE TABLE plan_details (item_id uuid PRIMARY KEY)`);
    await runner.query(
      `CREATE TABLE subscribers (id uuid PRIMARY KEY, customer_segment varchar(30) NOT NULL)`,
    );
    await runner.query(`
      CREATE TABLE contracts (
        id uuid PRIMARY KEY, tenant_id uuid NOT NULL, subscriber_id uuid NOT NULL,
        plan_id varchar(120) NOT NULL, status varchar(20) NOT NULL,
        customer_segment varchar(30) NULL, deleted_at timestamptz NULL)`);
    await m183.up(runner);

    for (const plan of [PLAN_SAME, PLAN_DIFF, PLAN_ZERO]) {
      await runner.query(`INSERT INTO catalog_items (id, tenant_id) VALUES ($1, $2)`, [
        plan,
        TENANT_ID,
      ]);
      await runner.query(`INSERT INTO plan_details (item_id) VALUES ($1)`, [plan]);
    }
    const price = `INSERT INTO catalog_price_history
      (item_id, tenant_id, customer_segment, installation_fee, is_current) VALUES ($1,$2,$3,$4,$5)`;
    await runner.query(price, [PLAN_SAME, TENANT_ID, 'RESIDENTIAL', 100000, true]);
    await runner.query(price, [PLAN_SAME, TENANT_ID, 'PYME', 250000, true]);
    await runner.query(price, [PLAN_SAME, TENANT_ID, 'RESIDENTIAL', 90000, false]);
    await runner.query(price, [PLAN_DIFF, TENANT_ID, 'RESIDENTIAL', 80000, true]);
    // Cargo igual al vigente, distinto al vigente y en cero (no se respalda).
    await runner.query(
      `UPDATE plan_details SET connection_fee = 100000, offers_permanence = true,
         permanence_months = 6, permanence_discounted_amount = 60000 WHERE item_id = $1`,
      [PLAN_SAME],
    );
    await runner.query(`UPDATE plan_details SET connection_fee = 95000 WHERE item_id = $1`, [
      PLAN_DIFF,
    ]);

    await runner.query(
      `INSERT INTO subscribers (id, customer_segment) VALUES ($1,'PYME'),($2,'RESIDENTIAL')`,
      [SUB_PYME, SUB_RES],
    );
    const contract = `INSERT INTO contracts
      (id, tenant_id, subscriber_id, plan_id, status, customer_segment) VALUES ($1,$2,$3,$4,$5,$6)`;
    await runner.query(contract, [C_DRAFT_OWN, TENANT_ID, SUB_RES, PLAN_SAME, 'DRAFT', 'PYME']);
    await runner.query(contract, [C_DRAFT_SUB, TENANT_ID, SUB_RES, PLAN_SAME, 'DRAFT', null]);
    await runner.query(contract, [C_ACTIVE, TENANT_ID, SUB_PYME, PLAN_SAME, 'ACTIVE', null]);
    await runner.query(contract, [C_LEGACY, TENANT_ID, SUB_RES, 'plan-legacy', 'DRAFT', null]);
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

  it('up: respalda connection_fee marcando los distintos y lo retira', async () => {
    await m191.up(qr());
    expect(await columnExists('plan_details', 'connection_fee')).toBe(false);
    const backup = (await qr().query(
      `SELECT item_id, tenant_id, connection_fee, matches_installation_fee
         FROM plan_connection_fee_retirements ORDER BY connection_fee`,
    )) as Array<Record<string, unknown>>;
    expect(backup).toEqual([
      {
        item_id: PLAN_DIFF,
        tenant_id: TENANT_ID,
        connection_fee: '95000.00',
        matches_installation_fee: false,
      },
      {
        item_id: PLAN_SAME,
        tenant_id: TENANT_ID,
        connection_fee: '100000.00',
        matches_installation_fee: true,
      },
    ]);
  });

  it('up: congela installation_fee vigente solo en contratos en borrador', async () => {
    expect(await fees()).toEqual({
      [C_DRAFT_OWN]: '250000.00',
      [C_DRAFT_SUB]: '100000.00',
      [C_ACTIVE]: null,
      [C_LEGACY]: null,
    });
    await qr().query('SAVEPOINT sp_191');
    await expect(
      qr().query(`UPDATE contracts SET installation_fee = -1 WHERE id = $1`, [C_ACTIVE]),
    ).rejects.toMatchObject({ constraint: 'chk_contracts_installation_fee' });
    await qr().query('ROLLBACK TO SAVEPOINT sp_191');
  });

  it('up: la oferta ya no se limita en la base contra el cargo retirado', async () => {
    await qr().query(
      `UPDATE plan_details SET permanence_discounted_amount = 999999 WHERE item_id = $1`,
      [PLAN_SAME],
    );
    await qr().query('SAVEPOINT sp_191_offer');
    await expect(
      qr().query(`UPDATE plan_details SET permanence_months = NULL WHERE item_id = $1`, [
        PLAN_SAME,
      ]),
    ).rejects.toMatchObject({ constraint: 'chk_plan_details_permanence_offer' });
    await qr().query('ROLLBACK TO SAVEPOINT sp_191_offer');
    await qr().query(
      `UPDATE plan_details SET permanence_discounted_amount = 60000 WHERE item_id = $1`,
      [PLAN_SAME],
    );
  });

  it('down: bloqueado con valores congelados; destructivo restaura connection_fee', async () => {
    await expect(m191.down(qr())).rejects.toThrow(/bloqueado/u);
    expect(await columnExists('contracts', 'installation_fee')).toBe(true);

    await destructive(() => m191.down(qr()));
    expect(await columnExists('contracts', 'installation_fee')).toBe(false);
    const restored = (await qr().query(
      `SELECT item_id, connection_fee FROM plan_details ORDER BY connection_fee`,
    )) as Array<{ item_id: string; connection_fee: string }>;
    expect(Object.fromEntries(restored.map((row) => [row.item_id, row.connection_fee]))).toEqual({
      [PLAN_ZERO]: '0.00',
      [PLAN_DIFF]: '95000.00',
      [PLAN_SAME]: '100000.00',
    });
    const backupGone = (await qr().query(
      `SELECT to_regclass('plan_connection_fee_retirements') IS NULL AS gone`,
    )) as Array<{ gone: boolean }>;
    expect(backupGone[0]?.gone).toBe(true);
  });

  it('down en vacío no exige la variable y la 191 se reaplica', async () => {
    await m191.up(qr());
    await qr().query(`UPDATE contracts SET installation_fee = NULL`);
    await m191.down(qr());
    expect(await columnExists('plan_details', 'connection_fee')).toBe(true);
    await m191.up(qr());
    expect(await columnExists('contracts', 'installation_fee')).toBe(true);
    expect(await columnExists('plan_details', 'connection_fee')).toBe(false);
  });
});
