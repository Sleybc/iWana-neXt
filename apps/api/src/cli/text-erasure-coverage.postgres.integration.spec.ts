import { randomUUID } from 'node:crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import { resolveMigrationDbCredentials } from '../../../../packages/database/src/db-credentials';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
  TENANT_MIGRATIONS,
} from '../../../../packages/database/src/migrations/tenant/runner';
import { listDeferredMigrations } from '../../../../packages/database/src/migrations/shared/deferred-migration.util';
import { TEXT_ERASURE_MANIFEST, type TextErasureManifestEntry } from './text-erasure-manifest';

const integrationEnabled = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const databaseName = process.env['DB_NAME'] ?? '';
const supportedDatabaseName =
  databaseName === 'test' || /^iwana_it_g7_[a-z0-9_]+$/u.test(databaseName);
const describeWithDb = integrationEnabled && supportedDatabaseName ? describe : describe.skip;

if (integrationEnabled && !supportedDatabaseName) {
  console.warn(
    `[B4] Invariante de cobertura omitido: DB_NAME debe ser test o iwana_it_g7_*; recibida ${databaseName || '(vacía)'}.`,
  );
}

jest.setTimeout(900_000);

const EXPECTED_MANIFEST_SIZE = 704;
const EXPECTED_CLASSIFIED_MOD14 = 37;

/**
 * Predicado textual D-BT-10: el mismo que produjo el manifiesto desde
 * tenant_test (704 columnas en 134 tablas). Cualquier columna nueva de texto
 * libre que una migración añada aparece aquí y rompe la igualdad exacta.
 */
async function liveTextColumns(qr: QueryRunner): Promise<Set<string>> {
  const rows = (await qr.query(
    `SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND (data_type IN ('character varying','text','character','json','jsonb')
             OR udt_name LIKE '\\_%'
             OR data_type = 'USER-DEFINED'
             OR data_type = 'ARRAY'
             OR data_type = 'inet')
      ORDER BY table_name, column_name`,
  )) as Array<{ table_name: string; column_name: string }>;
  return new Set(rows.map((row) => `${row.table_name}.${row.column_name}`));
}

export function assertTextErasureManifestCovers(
  live: ReadonlySet<string>,
  manifest: readonly TextErasureManifestEntry[] = TEXT_ERASURE_MANIFEST,
): void {
  const declared = new Set(manifest.map((entry) => `${entry.t}.${entry.c}`));
  const missing = [...live].filter((key) => !declared.has(key)).sort();
  const stale = [...declared].filter((key) => !live.has(key)).sort();
  if (missing.length > 0 || stale.length > 0) {
    throw new Error(
      `Manifiesto de texto libre desactualizado: sin clasificar [${missing.join(', ')}]; ` +
        `clasificadas que ya no existen [${stale.join(', ')}].`,
    );
  }
}

describe('D-BT-10 — manifiesto de columnas textuales (puro)', () => {
  it('el manifiesto declara 704 entradas únicas con motivo no vacío', () => {
    expect(TEXT_ERASURE_MANIFEST).toHaveLength(EXPECTED_MANIFEST_SIZE);
    const keys = TEXT_ERASURE_MANIFEST.map((entry) => `${entry.t}.${entry.c}`);
    expect(new Set(keys).size).toBe(EXPECTED_MANIFEST_SIZE);
    for (const entry of TEXT_ERASURE_MANIFEST) {
      expect(entry.d.trim().length).toBeGreaterThan(0);
    }
  });

  it('MOD14 clasifica sus 37 columnas con siete reglas de supresión y cero pendientes', () => {
    const pending = TEXT_ERASURE_MANIFEST.filter((entry) => entry.k === 'PENDIENTE-MOD14');
    expect(pending).toHaveLength(0);
    const classified = TEXT_ERASURE_MANIFEST.filter(
      (entry) => entry.t.startsWith('billing_') || entry.t === 'crm_contract_price_backup_175',
    );
    expect(classified).toHaveLength(EXPECTED_CLASSIFIED_MOD14);
    expect(classified.filter((entry) => entry.k === 'CUBIERTA')).toHaveLength(7);
  });

  it('CA-BT-12 detecta en rojo una columna nueva sin clasificar', () => {
    const live = new Set(TEXT_ERASURE_MANIFEST.map((entry) => `${entry.t}.${entry.c}`));
    live.add('support_tickets.zz_b4_probe_text');
    expect(() => assertTextErasureManifestCovers(live)).toThrow('zz_b4_probe_text');
  });

  it('CA-BT-12 detecta en rojo una clasificada que ya no existe', () => {
    const live = new Set(TEXT_ERASURE_MANIFEST.map((entry) => `${entry.t}.${entry.c}`));
    live.delete('support_tickets.subject');
    expect(() => assertTextErasureManifestCovers(live)).toThrow('support_tickets.subject');
  });
});

describeWithDb('D-BT-10 — manifiesto contra esquema migrado real', () => {
  const schemaName = `tenant_b4_coverage_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const tenantId = randomUUID();
  const tenantSlug = `b4-coverage-${randomUUID().slice(0, 8)}`;
  let baseDataSource: DataSource | undefined;
  let tenantRunner: QueryRunner | undefined;

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    baseDataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      username: credentials.username,
      password: credentials.password,
      database: process.env['DB_NAME'] ?? 'iwana',
      entities: [],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { max: 2, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await baseDataSource.initialize();

    const bootstrap = baseDataSource.createQueryRunner();
    try {
      await bootstrap.query(`CREATE SCHEMA "${schemaName}"`);
      await bootstrap.query(
        `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
         VALUES ($1, 'B4 coverage synthetic fixture', $2, $3, 'INACTIVE', 'b4-coverage@invalid.example')`,
        [tenantId, tenantSlug, schemaName],
      );
    } finally {
      await bootstrap.release();
    }

    const tenantDataSource = createTenantDataSource(baseDataSource, schemaName, tenantSlug);
    await tenantDataSource.initialize();
    try {
      // Sin IWANA_APPLY_PII_CONTRACT: el manifiesto cubre el esquema con las
      // columnas legacy-hash presentes, como tenant_test (704 columnas). La
      // única diferida es 109 (contract que las retira); si aparece otra
      // diferida, el conteo cambia y hay que regenerar el manifiesto.
      await applyTenantMigrationsInOrder(tenantDataSource);
      const [migrationCountRow] = (await tenantDataSource.query(
        'SELECT COUNT(*)::int AS count FROM typeorm_migrations',
      )) as Array<{ count: number }>;
      const deferred = listDeferredMigrations(TENANT_MIGRATIONS);
      expect(deferred.map((entry) => entry.name)).toEqual([
        'DropPiiSha256HashColumns1090000000000',
      ]);
      expect(migrationCountRow?.count ?? 0).toBe(TENANT_MIGRATIONS.length - deferred.length);
    } finally {
      await tenantDataSource.destroy();
    }

    tenantRunner = baseDataSource.createQueryRunner();
    await tenantRunner.connect();
    await tenantRunner.query(`SET search_path TO "${schemaName}"`);
  });

  afterAll(async () => {
    try {
      if (tenantRunner && !tenantRunner.isReleased) await tenantRunner.release();
    } finally {
      if (baseDataSource?.isInitialized) {
        const cleanup = baseDataSource.createQueryRunner();
        try {
          await cleanup.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
          await cleanup.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
        } finally {
          await cleanup.release();
          await baseDataSource.destroy();
        }
      }
      baseDataSource = undefined;
      tenantRunner = undefined;
    }
  });

  it('igualdad exacta entre el manifiesto y el esquema migrado', async () => {
    const live = await liveTextColumns(tenantRunner!);
    expect(live.size).toBe(EXPECTED_MANIFEST_SIZE);
    expect(() => assertTextErasureManifestCovers(live)).not.toThrow();
  });

  it('CA-BT-12 muerde con una columna temporal y se revierte', async () => {
    const qr = tenantRunner!;
    await qr.query('ALTER TABLE ticket_sla_policies ADD COLUMN zz_b4_probe_text text');
    try {
      const live = await liveTextColumns(qr);
      expect(live.size).toBe(EXPECTED_MANIFEST_SIZE + 1);
      expect(() => assertTextErasureManifestCovers(live)).toThrow('zz_b4_probe_text');
    } finally {
      await qr.query('ALTER TABLE ticket_sla_policies DROP COLUMN zz_b4_probe_text');
    }
    const liveAfter = await liveTextColumns(qr);
    expect(() => assertTextErasureManifestCovers(liveAfter)).not.toThrow();
  });
});
