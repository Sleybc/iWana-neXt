/**
 * EV-1 — Paridad CA-H6-06: SQL Postgres real ↔ calculateUsefulLife (día-exacta).
 *
 * Ejecutar:
 *   IWANA_DB_INTEGRATION_AVAILABLE=true pnpm --filter @iwana/api test:integration -- --runTestsByPath src/modules/inventory/tests/useful-life-alerts.parity.postgres.integration.spec.ts
 *
 * Sin IWANA_DB_INTEGRATION_AVAILABLE=true la suite se omite.
 * Paridad = SQL Postgres real ↔ `calculateUsefulLife` / `usefulLifeExpiryDate`.
 */
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { TenantContext, dataSourceOptions, runInTenantSchema } from '@iwana/db';
import {
  USEFUL_LIFE_ALERT_THRESHOLD_MONTHS,
  calculateUsefulLife,
  usefulLifeExpiryDate,
} from '../services/serialized-asset-useful-life.util';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../packages/database/src/migrations/tenant/runner';

function loadWorkspaceEnv(): void {
  if (process.env.DB_HOST && process.env.DB_PASSWORD) {
    return;
  }

  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../../.env'),
    resolve(__dirname, '../../../../../../.env'),
    resolve(__dirname, '../../../../../../../.env'),
  ];

  for (const envPath of candidates) {
    if (!existsSync(envPath)) {
      continue;
    }
    const content = readFileSync(envPath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) {
        continue;
      }
      const eq = line.indexOf('=');
      if (eq <= 0) {
        continue;
      }
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
    break;
  }
}

loadWorkspaceEnv();

const enabled = process.env.IWANA_DB_INTEGRATION_AVAILABLE === 'true';
const syntheticTenantId = randomUUID();
const syntheticTenantSlug = `ev1-useful-life-${syntheticTenantId.slice(0, 8)}`;
const syntheticSchemaName = `tenant_ev1_useful_life_${randomUUID().replace(/-/g, '')}`;

const SERIAL_PREFIX = 'EV1-H6-UL-';
const REF_DATE = '2026-07-21';
const REF_DATE_ALT = '2026-01-01';

type ExpectedStatus = 'sin-dato' | 'vigente' | 'por-vencer' | 'vencida';

type ParityCase = {
  label: string;
  serialSuffix: string;
  purchaseDate: string | null;
  usefulLifeMonths: number | null;
  expected: ExpectedStatus;
  /** Si se omite, usa REF_DATE. */
  referenceDate?: string;
};

const PARITY_CASES: ParityCase[] = [
  {
    label: 'sin-dato (sin purchase_date)',
    serialSuffix: 'SIN-DATO',
    purchaseDate: null,
    usefulLifeMonths: 36,
    expected: 'sin-dato',
  },
  {
    label: 'vigente (día 1)',
    serialSuffix: 'VIG-D01',
    purchaseDate: '2024-01-01',
    usefulLifeMonths: 36,
    expected: 'vigente',
  },
  {
    label: 'por-vencer (día 1)',
    serialSuffix: 'POR-D01',
    purchaseDate: '2025-08-01',
    usefulLifeMonths: 12,
    expected: 'por-vencer',
  },
  {
    label: 'vencida (día 1)',
    serialSuffix: 'VEN-D01',
    purchaseDate: '2025-01-01',
    usefulLifeMonths: 6,
    expected: 'vencida',
  },
  {
    label: 'borde día 28 vigente',
    serialSuffix: 'D28',
    purchaseDate: '2026-01-28',
    usefulLifeMonths: 12,
    expected: 'vigente',
  },
  {
    label: 'borde día 29 (bisiesto) vigente',
    serialSuffix: 'D29',
    purchaseDate: '2024-01-29',
    usefulLifeMonths: 36,
    expected: 'vigente',
  },
  {
    label: 'borde día 30 NO-GO vigente',
    serialSuffix: 'D30-NOGO',
    purchaseDate: '2026-04-30',
    usefulLifeMonths: 6,
    expected: 'vigente',
  },
  {
    label: 'borde día 31 vigente',
    serialSuffix: 'D31',
    purchaseDate: '2026-01-31',
    usefulLifeMonths: 12,
    expected: 'vigente',
  },
  {
    label: 'NO-GO 2025-01-15 · 12m · ref 2026-01-01 → por-vencer',
    serialSuffix: 'NOGO-JAN15',
    purchaseDate: '2025-01-15',
    usefulLifeMonths: 12,
    expected: 'por-vencer',
    referenceDate: REF_DATE_ALT,
  },
];

(enabled ? describe : describe.skip)('EV-1 CA-H6-06 paridad SQL ↔ helper (DB real)', () => {
  let dataSource: DataSource;
  let tenantId: string;
  let schemaName: string;
  let itemId: string;
  let schemaReady = false;
  const createdAssetIds: string[] = [];

  beforeAll(async () => {
    dataSource = new DataSource({
      ...dataSourceOptions,
      entities: [],
      synchronize: false,
      logging: false,
    });
    await dataSource.initialize();
    tenantId = syntheticTenantId;
    schemaName = syntheticSchemaName;
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5)`,
      [
        tenantId,
        'EV1 useful life synthetic',
        syntheticTenantSlug,
        schemaName,
        'ev1-useful-life@example.invalid',
      ],
    );
    await dataSource.query(`CREATE SCHEMA "${schemaName}"`);
    const tenantDataSource = createTenantDataSource(dataSource, schemaName, syntheticTenantSlug);
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }
    schemaReady = true;

    await runInTenantSchema(dataSource, schemaName, async (qr) => {
      const categories = (await qr.query(
        `INSERT INTO inventory_categories (
           tenant_id, code, code_prefix, name, status, sort_order
         ) VALUES ($1, 'EV1-CAT', 'EV1', 'EV1 categoría sintética', 'ACTIVE', 0)
         RETURNING id::text AS id`,
        [tenantId],
      )) as Array<{ id: string }>;
      const items = (await qr.query(
        `INSERT INTO inventory_items (
           tenant_id, sku, name, item_kind, category, category_id,
           tracking_mode, unit_of_measure, status, purchasable
         ) VALUES ($1, 'EV1-UL-001', 'EV1 item sintético', 'STOCK', 'CPE', $2,
                   'SERIALIZED', 'UNIT', 'ACTIVE', false)
         RETURNING id::text AS id`,
        [tenantId, categories[0]!.id],
      )) as Array<{ id: string }>;
      itemId = items[0]!.id;

      // Limpia residuos de corridas anteriores.
      await qr.query(
        `DELETE FROM serialized_assets
         WHERE tenant_id = $1
           AND serial_number LIKE $2`,
        [tenantId, `${SERIAL_PREFIX}%`],
      );

      for (const testCase of PARITY_CASES) {
        const serialNumber = `${SERIAL_PREFIX}${testCase.serialSuffix}`;
        const inserted = (await qr.query(
          `INSERT INTO serialized_assets (
             tenant_id, inventory_item_id, serial_number, normalized_serial_number,
             mac_address, normalized_mac_address, asset_tag, current_status,
             current_location_id, current_responsible_type, current_responsible_ref_id,
             subscriber_ref_id, contract_ref_id, purchase_order_ref,
             purchase_date, useful_life_months, warranty_until
           ) VALUES (
             $1, $2, $3, $4,
             NULL, NULL, NULL, 'AVAILABLE',
             NULL, 'WAREHOUSE', NULL,
             NULL, NULL, NULL,
             $5::date, $6, NULL
           )
           RETURNING id::text AS id`,
          [
            tenantId,
            itemId,
            serialNumber,
            serialNumber.toUpperCase(),
            testCase.purchaseDate,
            testCase.usefulLifeMonths,
          ],
        )) as Array<{ id: string }>;
        createdAssetIds.push(inserted[0]!.id);
      }
    });
  }, 60_000);

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      if (schemaReady)
        await runInTenantSchema(dataSource, schemaName, async (qr) => {
          if (createdAssetIds.length > 0) {
            await qr.query(
              `DELETE FROM serialized_assets
             WHERE tenant_id = $1
               AND id = ANY($2::uuid[])`,
              [tenantId, createdAssetIds],
            );
          }
        });
      await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
      await dataSource.destroy();
    }
  });

  async function pgExpiry(purchaseDate: string, usefulLifeMonths: number): Promise<string> {
    const rows = (await dataSource.query(
      `SELECT ($1::date + ($2 * INTERVAL '1 month'))::text AS expiry`,
      [purchaseDate, usefulLifeMonths],
    )) as Array<{ expiry: string }>;
    return rows[0]!.expiry.slice(0, 10);
  }

  async function sqlAlertIds(
    statusFilter: 'por-vencer' | 'vencida' | 'all',
    refDate: string,
  ): Promise<Set<string>> {
    return runInTenantSchema(dataSource, schemaName, async (qr) => {
      const expiryExpr = `(purchase_date + (useful_life_months * INTERVAL '1 month'))`;
      const thresholdEndExpr = `($1::date + ($2::int * INTERVAL '1 month'))`;

      let statusClause: string;
      let params: unknown[];

      if (statusFilter === 'vencida') {
        statusClause = `${expiryExpr} <= $1::date`;
        params = [refDate, tenantId, `${SERIAL_PREFIX}%`];
        const rows = (await qr.query(
          `SELECT id::text AS id
           FROM serialized_assets
           WHERE tenant_id = $2
             AND serial_number LIKE $3
             AND purchase_date IS NOT NULL
             AND useful_life_months IS NOT NULL
             AND current_status NOT IN ('WRITTEN_OFF', 'LOST', 'SOLD')
             AND ${statusClause}`,
          params,
        )) as Array<{ id: string }>;
        return new Set(rows.map((row) => row.id));
      }

      if (statusFilter === 'por-vencer') {
        statusClause = `${expiryExpr} > $1::date AND ${expiryExpr} <= ${thresholdEndExpr}`;
      } else {
        statusClause = `${expiryExpr} <= ${thresholdEndExpr}`;
      }

      params = [refDate, USEFUL_LIFE_ALERT_THRESHOLD_MONTHS, tenantId, `${SERIAL_PREFIX}%`];
      const rows = (await qr.query(
        `SELECT id::text AS id
         FROM serialized_assets
         WHERE tenant_id = $3
           AND serial_number LIKE $4
           AND purchase_date IS NOT NULL
           AND useful_life_months IS NOT NULL
           AND current_status NOT IN ('WRITTEN_OFF', 'LOST', 'SOLD')
           AND ${statusClause}`,
        params,
      )) as Array<{ id: string }>;

      return new Set(rows.map((row) => row.id));
    });
  }

  it('PG INTERVAL expiry coincide con usefulLifeExpiryDate en bordes 1/28/29/30/31', async () => {
    const borders: Array<{ purchaseDate: string; months: number }> = [
      { purchaseDate: '2026-01-01', months: 6 },
      { purchaseDate: '2026-01-28', months: 6 },
      { purchaseDate: '2024-01-29', months: 6 },
      { purchaseDate: '2026-04-30', months: 6 },
      { purchaseDate: '2026-01-31', months: 6 },
      { purchaseDate: '2025-01-15', months: 12 },
    ];

    for (const border of borders) {
      const fromPg = await pgExpiry(border.purchaseDate, border.months);
      const fromHelper = usefulLifeExpiryDate(border.purchaseDate, border.months)
        .toISOString()
        .slice(0, 10);
      expect(fromHelper).toBe(fromPg);
    }
  });

  it('SQL y calculateUsefulLife clasifican igual los bordes CA-H6-06 (EV-1)', async () => {
    const assetsBySerial = await runInTenantSchema(dataSource, schemaName, async (qr) => {
      const rows = (await qr.query(
        `SELECT id::text AS id, serial_number AS "serialNumber"
         FROM serialized_assets
         WHERE tenant_id = $1
           AND serial_number LIKE $2`,
        [tenantId, `${SERIAL_PREFIX}%`],
      )) as Array<{ id: string; serialNumber: string }>;
      return new Map(rows.map((asset) => [asset.serialNumber, asset]));
    });

    const alertIdsDefault = await sqlAlertIds('all', REF_DATE);
    const porVencerIds = await sqlAlertIds('por-vencer', REF_DATE);
    const vencidaIds = await sqlAlertIds('vencida', REF_DATE);
    const porVencerAlt = await sqlAlertIds('por-vencer', REF_DATE_ALT);
    const vencidaAlt = await sqlAlertIds('vencida', REF_DATE_ALT);

    for (const testCase of PARITY_CASES) {
      const serial = `${SERIAL_PREFIX}${testCase.serialSuffix}`;
      const asset = assetsBySerial.get(serial);
      expect(asset).toBeDefined();

      const refIso = testCase.referenceDate ?? REF_DATE;
      const referenceDate = new Date(`${refIso}T00:00:00.000Z`);
      const life = calculateUsefulLife({
        purchaseDate: testCase.purchaseDate,
        usefulLifeMonths: testCase.usefulLifeMonths,
        warrantyUntil: null,
        referenceDate,
      });

      expect(life.status).toBe(testCase.expected);

      const inPorVencer =
        refIso === REF_DATE_ALT ? porVencerAlt.has(asset!.id) : porVencerIds.has(asset!.id);
      const inVencida =
        refIso === REF_DATE_ALT ? vencidaAlt.has(asset!.id) : vencidaIds.has(asset!.id);
      const inAnyAlert =
        refIso === REF_DATE_ALT
          ? porVencerAlt.has(asset!.id) || vencidaAlt.has(asset!.id)
          : alertIdsDefault.has(asset!.id);

      if (testCase.expected === 'sin-dato' || testCase.expected === 'vigente') {
        expect(inAnyAlert).toBe(false);
        expect(inPorVencer).toBe(false);
        expect(inVencida).toBe(false);
      } else if (testCase.expected === 'por-vencer') {
        expect(inPorVencer).toBe(true);
        expect(inVencida).toBe(false);
        expect(inAnyAlert).toBe(true);
      } else if (testCase.expected === 'vencida') {
        expect(inVencida).toBe(true);
        expect(inPorVencer).toBe(false);
        expect(inAnyAlert).toBe(true);
      }
    }

    // Sanity: TenantContext no se usa en SQL crudo; el filtro tenant_id está en la query.
    expect(TenantContext).toBeDefined();
  });
});
