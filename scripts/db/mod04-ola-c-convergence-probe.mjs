/**
 * Demuestra convergencia DDL users: tenant preexistente vs schema nuevo
 * con la misma cadena TENANT_MIGRATIONS (incluye 083/084).
 *
 * Uso (desde raíz, @iwana/db build previo):
 *   node packages/database/dist/cli/...  — o:
 *   node --import tsx scripts/db/mod04-ola-c-convergence-probe.mjs
 *
 * Sin PII. Limpia el schema sintético al final.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbRoot = join(__dirname, '../../packages/database');
const requireFromDb = createRequire(join(dbRoot, 'package.json'));
const { Client } = requireFromDb('pg');
const { DataSource } = requireFromDb('typeorm');
const { TENANT_MIGRATIONS, applyTenantMigrationsInOrder, createTenantDataSource } = requireFromDb(
  './dist/migrations/tenant/runner.js',
);

const PROBE_SCHEMA = 'tenant_mod04_ola_c_conv';

function env(name, fallback) {
  return process.env[name] ?? fallback;
}

async function snapshot(client, schema) {
  const { rows } = await client.query(
    `
    SELECT
      $1::text AS schema_name,
      MAX(CASE WHEN col.column_name = 'email' THEN col.character_maximum_length END) AS email_len,
      MAX(CASE WHEN col.column_name = 'first_name' THEN col.character_maximum_length END) AS first_len,
      MAX(CASE WHEN col.column_name = 'last_name' THEN col.character_maximum_length END) AS last_len,
      MAX(CASE WHEN col.column_name = 'document_number' THEN col.character_maximum_length END) AS doc_len,
      EXISTS (
        SELECT 1
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = rel.relnamespace
        WHERE n.nspname = $1
          AND rel.relname = 'users'
          AND con.conname = 'uq_users_email'
          AND con.contype = 'u'
      ) AS has_uq_users_email,
      to_regclass(format('%I.idx_users_first_name', $1)) IS NOT NULL AS has_idx_first_name,
      to_regclass(format('%I.idx_users_last_name', $1)) IS NOT NULL AS has_idx_last_name,
      to_regclass(format('%I.idx_users_email_trgm', $1)) IS NOT NULL AS has_idx_email_trgm
    FROM information_schema.columns col
    WHERE col.table_schema = $1
      AND col.table_name = 'users'
      AND col.column_name IN ('email', 'first_name', 'last_name', 'document_number')
    `,
    [schema],
  );
  return rows[0];
}

function fingerprint(row) {
  return [
    row.email_len,
    row.first_len,
    row.last_len,
    row.doc_len,
    row.has_uq_users_email,
    row.has_idx_first_name,
    row.has_idx_last_name,
    row.has_idx_email_trgm,
  ].join('|');
}

async function main() {
  const base = {
    type: 'postgres',
    host: env('DB_HOST', '127.0.0.1'),
    port: Number(env('DB_PORT', '5433')),
    username: env('DB_MIGRATOR_USER', env('DB_USER', 'iwana')),
    password: env('DB_MIGRATOR_PASSWORD', env('DB_PASSWORD', 'iwana')),
    database: env('DB_NAME', 'dbiw'),
  };

  const client = new Client({
    host: base.host,
    port: base.port,
    user: base.username,
    password: base.password,
    database: base.database,
  });
  await client.connect();

  try {
    const preexisting = (
      await client.query(
        `SELECT schema_name FROM public.tenants WHERE status = 'ACTIVE' ORDER BY schema_name LIMIT 1`,
      )
    ).rows[0]?.schema_name;
    if (!preexisting) {
      throw new Error('No hay tenant ACTIVE para comparar.');
    }

    await client.query(`DROP SCHEMA IF EXISTS ${PROBE_SCHEMA} CASCADE`);
    await client.query(`CREATE SCHEMA ${PROBE_SCHEMA}`);

    const bootstrapDs = new DataSource({
      ...base,
      name: 'mod04-ola-c-conv-bootstrap',
      entities: [],
      synchronize: false,
      logging: false,
    });
    await bootstrapDs.initialize();

    // createTenantDataSource fija search_path al schema probe
    const tenantDs = createTenantDataSource(bootstrapDs, PROBE_SCHEMA, 'mod04-ola-c-conv');
    await tenantDs.initialize();
    try {
      console.log(`Aplicando ${TENANT_MIGRATIONS.length} migraciones en ${PROBE_SCHEMA}…`);
      await applyTenantMigrationsInOrder(tenantDs);
    } finally {
      await tenantDs.destroy();
      await bootstrapDs.destroy();
    }

    const snapNew = await snapshot(client, PROBE_SCHEMA);
    const snapOld = await snapshot(client, preexisting);

    console.log('preexistente', snapOld);
    console.log('nuevo', snapNew);

    const fpNew = fingerprint(snapNew);
    const fpOld = fingerprint(snapOld);
    if (fpNew !== fpOld) {
      console.error('FAIL convergencia', { fpNew, fpOld });
      process.exitCode = 1;
    } else {
      console.log('OK convergencia DDL users (083+084) nuevo ≡ preexistente');
    }
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS ${PROBE_SCHEMA} CASCADE`);
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
