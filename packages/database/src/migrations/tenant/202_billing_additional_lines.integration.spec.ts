import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { BillingAdditionalLines2020000000202 } from './202_billing_additional_lines';

/**
 * Migración 202 — adicionales facturados (spec MOD14 2026-11-12 bloque C) en PostgreSQL real:
 * enlace de la línea al ítem, relleno del precio congelado por segmento (sin tocar titulares
 * anonimizados ni entradas ya congeladas), down con guarda destructiva y reaplicación.
 */
const SCHEMA = `tenant_add_lines_${randomBytes(5).toString('hex')}`;
const TENANT_ID = randomUUID();
const PRODUCT = randomUUID();
const SERVICE = randomUUID();
const NO_PRICE = randomUUID();
const SUB_LIVE = randomUUID();
const SUB_ANON = randomUUID();
const C_RES = randomUUID();
const C_BIZ = randomUUID();
const C_ANON = randomUUID();
const DESTRUCTIVE = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const INTEGRATION_DATABASE_NAME = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;

if (dbAvailable && !INTEGRATION_DATABASE_NAME.test(process.env['DB_NAME'] ?? '')) {
  throw new Error('Integración 202: DB_NAME debe ser dbiw, test o iwana_it_*.');
}

const entry = (itemId: string, itemType: 'PRODUCT' | 'SERVICE', extra = {}) => ({
  itemId,
  itemType,
  treatment: 'STANDARD',
  legalBasis: 'ET_468',
  ratePercent: 19,
  source: 'BACKFILL',
  frozenAt: '2026-11-12T00:00:00.000Z',
  ...extra,
});

describeWithDb('Migración 202 — adicionales facturados en PostgreSQL real', () => {
  let dataSource: DataSource | undefined;
  let runner: QueryRunner | undefined;
  const m202 = new BillingAdditionalLines2020000000202();

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

  async function snapshot(id: string): Promise<Array<Record<string, unknown>>> {
    const rows = (await qr().query(
      `SELECT additional_vat_snapshot AS s FROM contracts WHERE id = $1`,
      [id],
    )) as Array<{ s: Array<Record<string, unknown>> }>;
    return rows[0]!.s;
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
    // Mínimo de las tablas que lee la 202; sus demás columnas no intervienen.
    await runner.query(`
      CREATE TABLE billing_document_lines (
        id uuid PRIMARY KEY, tenant_id uuid NOT NULL, kind varchar(20) NOT NULL)`);
    await runner.query(`
      CREATE TABLE catalog_items (
        id uuid PRIMARY KEY, tenant_id uuid NOT NULL, type varchar(20) NOT NULL,
        name varchar(200) NOT NULL)`);
    await runner.query(`
      CREATE TABLE catalog_price_history (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), item_id uuid NOT NULL,
        tenant_id uuid NOT NULL, customer_segment varchar(30) NOT NULL,
        base_price numeric(14,2) NOT NULL, is_current boolean NOT NULL,
        valid_from timestamptz NOT NULL DEFAULT now())`);
    await runner.query(`
      CREATE TABLE subscribers (
        id uuid PRIMARY KEY, anonymized_at timestamptz NULL, anonymized_request_id uuid NULL)`);
    await runner.query(`
      CREATE TABLE contracts (
        id uuid PRIMARY KEY, tenant_id uuid NOT NULL, subscriber_id uuid NOT NULL,
        customer_segment varchar(20) NULL,
        additional_vat_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb)`);
    await runner.query(`
      CREATE FUNCTION reject_anonymized() RETURNS trigger LANGUAGE plpgsql AS $f$
      BEGIN
        IF EXISTS (SELECT 1 FROM subscribers s
                    WHERE s.id = OLD.subscriber_id AND s.anonymized_at IS NOT NULL) THEN
          RAISE EXCEPTION 'solo lectura' USING ERRCODE = '55000';
        END IF;
        RETURN NEW;
      END $f$`);
    await runner.query(`
      CREATE TRIGGER trg_reject_anonymized BEFORE UPDATE ON contracts
        FOR EACH ROW EXECUTE FUNCTION reject_anonymized()`);

    const item = `INSERT INTO catalog_items (id, tenant_id, type, name) VALUES ($1, $2, $3, $4)`;
    await runner.query(item, [PRODUCT, TENANT_ID, 'PRODUCT', 'Router']);
    await runner.query(item, [SERVICE, TENANT_ID, 'SERVICE', 'IP fija']);
    await runner.query(item, [NO_PRICE, TENANT_ID, 'SERVICE', 'Sin tarifa']);
    const price = `INSERT INTO catalog_price_history
      (item_id, tenant_id, customer_segment, base_price, is_current) VALUES ($1, $2, $3, $4, $5)`;
    await runner.query(price, [PRODUCT, TENANT_ID, 'RESIDENTIAL', 120000, true]);
    await runner.query(price, [PRODUCT, TENANT_ID, 'RESIDENTIAL', 99000, false]);
    await runner.query(price, [PRODUCT, TENANT_ID, 'BUSINESS', 150000, true]);
    await runner.query(price, [SERVICE, TENANT_ID, 'RESIDENTIAL', 30000, true]);
    await runner.query(
      `INSERT INTO subscribers (id, anonymized_at) VALUES ($1, NULL), ($2, now())`,
      [SUB_LIVE, SUB_ANON],
    );
    const contract = `INSERT INTO contracts
      (id, tenant_id, subscriber_id, customer_segment, additional_vat_snapshot)
      VALUES ($1, $2, $3, $4, $5::jsonb)`;
    await runner.query(contract, [
      C_RES,
      TENANT_ID,
      SUB_LIVE,
      null,
      JSON.stringify([
        entry(PRODUCT, 'PRODUCT'),
        entry(SERVICE, 'SERVICE', { name: 'Congelado', unitPrice: '1.00' }),
        entry(NO_PRICE, 'SERVICE'),
        entry('legado', 'PRODUCT'),
      ]),
    ]);
    await runner.query(contract, [
      C_BIZ,
      TENANT_ID,
      SUB_LIVE,
      'BUSINESS',
      JSON.stringify([entry(PRODUCT, 'PRODUCT')]),
    ]);
    await runner.query(contract, [
      C_ANON,
      TENANT_ID,
      SUB_ANON,
      null,
      JSON.stringify([entry(PRODUCT, 'PRODUCT')]),
    ]);
    await runner.query(
      `INSERT INTO billing_document_lines (id, tenant_id, kind) VALUES ($1, $2, 'PLAN')`,
      [randomUUID(), TENANT_ID],
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

  it('up: congela nombre y precio vigente por segmento; respeta lo congelado y los anonimizados', async () => {
    await m202.up(qr());

    expect(await snapshot(C_RES)).toEqual([
      expect.objectContaining({ itemId: PRODUCT, name: 'Router', unitPrice: '120000.00' }),
      expect.objectContaining({ itemId: SERVICE, name: 'Congelado', unitPrice: '1.00' }),
      expect.objectContaining({ itemId: NO_PRICE, name: 'Sin tarifa', unitPrice: null }),
      expect.objectContaining({ itemId: 'legado', unitPrice: null }),
    ]);
    expect((await snapshot(C_RES))[3]).not.toHaveProperty('name');
    expect(await snapshot(C_BIZ)).toEqual([
      expect.objectContaining({ itemId: PRODUCT, unitPrice: '150000.00' }),
    ]);
    expect((await snapshot(C_ANON))[0]).not.toHaveProperty('unitPrice');
  });

  it('up: solo una línea ADICIONAL puede enlazar un ítem', async () => {
    await qr().query('SAVEPOINT sp_202');
    await expect(
      qr().query(`UPDATE billing_document_lines SET additional_item_id = $1`, [PRODUCT]),
    ).rejects.toMatchObject({ constraint: 'chk_billing_document_lines_additional_item' });
    await qr().query('ROLLBACK TO SAVEPOINT sp_202');
    await qr().query(
      `INSERT INTO billing_document_lines (id, tenant_id, kind, additional_item_id)
       VALUES ($1, $2, 'ADICIONAL', $3)`,
      [randomUUID(), TENANT_ID, PRODUCT],
    );
  });

  it('down: bloqueado con enlaces; destructivo retira la columna y las claves y se reaplica', async () => {
    await expect(m202.down(qr())).rejects.toThrow(/bloqueado/u);
    expect(await columnExists('billing_document_lines', 'additional_item_id')).toBe(true);

    process.env[DESTRUCTIVE] = 'true';
    try {
      await m202.down(qr());
    } finally {
      delete process.env[DESTRUCTIVE];
    }
    expect(await columnExists('billing_document_lines', 'additional_item_id')).toBe(false);
    for (const value of await snapshot(C_RES)) {
      expect(value).not.toHaveProperty('unitPrice');
      expect(value).not.toHaveProperty('name');
    }

    await m202.up(qr());
    expect(await columnExists('billing_document_lines', 'additional_item_id')).toBe(true);
    expect((await snapshot(C_RES))[0]).toMatchObject({ unitPrice: '120000.00' });
  });
});
