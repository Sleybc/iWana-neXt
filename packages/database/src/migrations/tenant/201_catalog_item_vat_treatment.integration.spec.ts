import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { CatalogItemVatTreatment2010000000201 } from './201_catalog_item_vat_treatment';

/**
 * Migración 201 — IVA por ítem del catálogo (spec MOD14 2026-11-12 R1/R2) en PostgreSQL real:
 * relleno del catálogo, del plan y de los contratos (sin tocar titulares anonimizados),
 * restricciones, down con guarda destructiva y reaplicación.
 */
const SCHEMA = `tenant_item_vat_${randomBytes(5).toString('hex')}`;
const TENANT_ID = randomUUID();
const PLAN = randomUUID();
const PRODUCT = randomUUID();
const SERVICE = randomUUID();
const SUB_LIVE = randomUUID();
const SUB_ANON = randomUUID();
const C_FEE = randomUUID();
const C_NO_FEE = randomUUID();
const C_LEGACY_PLAN = randomUUID();
const C_ANON = randomUUID();
const DESTRUCTIVE = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const INTEGRATION_DATABASE_NAME = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;

if (dbAvailable && !INTEGRATION_DATABASE_NAME.test(process.env['DB_NAME'] ?? '')) {
  throw new Error('Integración 201: DB_NAME debe ser dbiw, test o iwana_it_*.');
}

describeWithDb('Migración 201 — IVA por ítem del catálogo en PostgreSQL real', () => {
  let dataSource: DataSource | undefined;
  let runner: QueryRunner | undefined;
  const m201 = new CatalogItemVatTreatment2010000000201();

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

  async function contracts(): Promise<
    Record<string, { installation: Record<string, unknown> | null; additionals: unknown[] }>
  > {
    const rows = (await qr().query(
      `SELECT id, installation_vat_snapshot, additional_vat_snapshot FROM contracts`,
    )) as Array<{
      id: string;
      installation_vat_snapshot: Record<string, unknown> | null;
      additional_vat_snapshot: unknown[];
    }>;
    return Object.fromEntries(
      rows.map((row) => [
        row.id,
        { installation: row.installation_vat_snapshot, additionals: row.additional_vat_snapshot },
      ]),
    );
  }

  async function rejectsWith(sql: string, params: unknown[], constraint: string): Promise<void> {
    await qr().query('SAVEPOINT sp_201');
    await expect(qr().query(sql, params)).rejects.toMatchObject({ constraint });
    await qr().query('ROLLBACK TO SAVEPOINT sp_201');
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
    // Mínimo de las tablas que lee la 201; sus demás columnas no intervienen.
    await runner.query(`
      CREATE TABLE catalog_items (
        id uuid PRIMARY KEY, tenant_id uuid NOT NULL, type varchar(20) NOT NULL)`);
    await runner.query(`CREATE TABLE plan_details (item_id uuid PRIMARY KEY)`);
    await runner.query(`
      CREATE TABLE subscribers (
        id uuid PRIMARY KEY, anonymized_at timestamptz NULL, anonymized_request_id uuid NULL)`);
    await runner.query(`
      CREATE TABLE contracts (
        id uuid PRIMARY KEY, tenant_id uuid NOT NULL, subscriber_id uuid NOT NULL,
        plan_id varchar(120) NOT NULL, installation_fee numeric(14,2) NULL,
        additional_product_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
        additional_service_ids jsonb NOT NULL DEFAULT '[]'::jsonb)`);
    // Como la 169/178: el contrato de un titular anonimizado es de solo lectura.
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

    const item = `INSERT INTO catalog_items (id, tenant_id, type) VALUES ($1, $2, $3)`;
    await runner.query(item, [PLAN, TENANT_ID, 'PLAN']);
    await runner.query(item, [PRODUCT, TENANT_ID, 'PRODUCT']);
    await runner.query(item, [SERVICE, TENANT_ID, 'SERVICE']);
    await runner.query(`INSERT INTO plan_details (item_id) VALUES ($1)`, [PLAN]);
    await runner.query(
      `INSERT INTO subscribers (id, anonymized_at) VALUES ($1, NULL), ($2, now())`,
      [SUB_LIVE, SUB_ANON],
    );
    const contract = `INSERT INTO contracts
      (id, tenant_id, subscriber_id, plan_id, installation_fee, additional_product_ids,
       additional_service_ids) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`;
    await runner.query(contract, [
      C_FEE,
      TENANT_ID,
      SUB_LIVE,
      PLAN,
      50000,
      JSON.stringify([PRODUCT, 'legacy-product', PRODUCT]),
      JSON.stringify([SERVICE]),
    ]);
    await runner.query(contract, [C_NO_FEE, TENANT_ID, SUB_LIVE, PLAN, null, '[]', '[]']);
    await runner.query(contract, [
      C_LEGACY_PLAN,
      TENANT_ID,
      SUB_LIVE,
      'plan-legacy',
      80000,
      '"no-es-arreglo"',
      '[]',
    ]);
    await runner.query(contract, [
      C_ANON,
      TENANT_ID,
      SUB_ANON,
      PLAN,
      50000,
      JSON.stringify([PRODUCT]),
      '[]',
    ]);
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

  it('up: productos y servicios quedan en STANDARD/ET_468; el plan en NULL con instalación STANDARD', async () => {
    await m201.up(qr());
    const items = (await qr().query(
      `SELECT ci.type, ci.vat_treatment, ci.vat_legal_basis,
              pd.installation_vat_treatment, pd.installation_vat_legal_basis
         FROM catalog_items ci LEFT JOIN plan_details pd ON pd.item_id = ci.id
        ORDER BY ci.type`,
    )) as Array<Record<string, unknown>>;
    expect(items).toEqual([
      {
        type: 'PLAN',
        vat_treatment: null,
        vat_legal_basis: null,
        installation_vat_treatment: 'STANDARD',
        installation_vat_legal_basis: 'ET_468',
      },
      {
        type: 'PRODUCT',
        vat_treatment: 'STANDARD',
        vat_legal_basis: 'ET_468',
        installation_vat_treatment: null,
        installation_vat_legal_basis: null,
      },
      {
        type: 'SERVICE',
        vat_treatment: 'STANDARD',
        vat_legal_basis: 'ET_468',
        installation_vat_treatment: null,
        installation_vat_legal_basis: null,
      },
    ]);
  });

  it('up: congela la instalación y los adicionales; no toca titulares anonimizados', async () => {
    const rows = await contracts();
    const standard = { treatment: 'STANDARD', legalBasis: 'ET_468', ratePercent: 19 };
    expect(rows[C_FEE]!.installation).toMatchObject({ ...standard, source: 'BACKFILL' });
    expect(String(rows[C_FEE]!.installation!['frozenAt'])).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u,
    );
    expect(rows[C_FEE]!.additionals).toEqual([
      expect.objectContaining({ itemId: PRODUCT, itemType: 'PRODUCT', ...standard }),
      expect.objectContaining({ itemId: 'legacy-product', itemType: 'PRODUCT', ...standard }),
      expect.objectContaining({ itemId: SERVICE, itemType: 'SERVICE', ...standard }),
    ]);
    // Sin cargo no se congela la instalación (lo hará el primer cobro o aplica D2).
    expect(rows[C_NO_FEE]).toEqual({ installation: null, additionals: [] });
    // Plan heredado: instalación STANDARD por defecto; arreglo inválido → sin adicionales.
    expect(rows[C_LEGACY_PLAN]!.installation).toMatchObject(standard);
    expect(rows[C_LEGACY_PLAN]!.additionals).toEqual([]);
    expect(rows[C_ANON]).toEqual({ installation: null, additionals: [] });
  });

  it('up: las restricciones exigen dominio, pareja tratamiento/base y plan sin IVA propio', async () => {
    await rejectsWith(
      `UPDATE catalog_items SET vat_treatment = 'ZERO' WHERE id = $1`,
      [PRODUCT],
      'chk_catalog_items_vat_treatment',
    );
    await rejectsWith(
      `UPDATE catalog_items SET vat_legal_basis = 'texto libre' WHERE id = $1`,
      [PRODUCT],
      'chk_catalog_items_vat_legal_basis',
    );
    await rejectsWith(
      `UPDATE catalog_items SET vat_legal_basis = NULL WHERE id = $1`,
      [PRODUCT],
      'chk_catalog_items_vat_pair',
    );
    await rejectsWith(
      `UPDATE catalog_items SET vat_treatment = 'STANDARD', vat_legal_basis = 'ET_468'
        WHERE id = $1`,
      [PLAN],
      'chk_catalog_items_plan_vat',
    );
    await rejectsWith(
      `UPDATE plan_details SET installation_vat_treatment = 'OTRO' WHERE item_id = $1`,
      [PLAN],
      'chk_plan_details_installation_vat_treatment',
    );
    await rejectsWith(
      `UPDATE contracts SET additional_vat_snapshot = '{}'::jsonb WHERE id = $1`,
      [C_NO_FEE],
      'chk_contracts_additional_vat_snapshot',
    );
    await rejectsWith(
      `UPDATE contracts SET installation_vat_snapshot = '[]'::jsonb WHERE id = $1`,
      [C_NO_FEE],
      'chk_contracts_installation_vat_snapshot',
    );
    // Un producto exento con su base legal sí es válido.
    await qr().query(
      `UPDATE catalog_items SET vat_treatment = 'EXEMPT', vat_legal_basis = 'ET_476_7'
        WHERE id = $1`,
      [SERVICE],
    );
  });

  it('down: bloqueado con datos congelados; destructivo retira columnas y se reaplica', async () => {
    await expect(m201.down(qr())).rejects.toThrow(/bloqueado/u);
    expect(await columnExists('contracts', 'installation_vat_snapshot')).toBe(true);

    await destructive(() => m201.down(qr()));
    for (const [table, column] of [
      ['catalog_items', 'vat_treatment'],
      ['catalog_items', 'vat_legal_basis'],
      ['plan_details', 'installation_vat_treatment'],
      ['plan_details', 'installation_vat_legal_basis'],
      ['contracts', 'installation_vat_snapshot'],
      ['contracts', 'additional_vat_snapshot'],
    ] as const) {
      expect(await columnExists(table, column)).toBe(false);
    }

    await m201.up(qr());
    expect(await columnExists('contracts', 'additional_vat_snapshot')).toBe(true);
    // Sin datos congelados ni tratamientos propios el down no exige la variable.
    await qr().query(`DELETE FROM contracts`);
    await m201.down(qr());
    expect(await columnExists('catalog_items', 'vat_treatment')).toBe(false);
    await m201.up(qr());
    expect(await columnExists('catalog_items', 'vat_treatment')).toBe(true);
  });
});
