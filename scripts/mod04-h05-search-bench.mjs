/**
 * Medición H-05: búsqueda de usuarios antes/después (pg_trgm).
 *
 * Uso (API/DB locales arriba, migraciones 018+084 aplicadas):
 *   node --import tsx scripts/mod04-h05-search-bench.mjs
 *
 * Variables: DATABASE_URL o DB_* estándar del monorepo.
 * Siembra ≥50k usuarios sintéticos en un schema de bench y mide latencia p50/p95.
 * Al terminar hace DROP SCHEMA CASCADE (schema huérfano, no registrado en public.tenants).
 * KEEP_BENCH_SCHEMA=1 conserva el schema para inspección manual.
 */
import pg from 'pg';
import { performance } from 'node:perf_hooks';

const TARGET_ROWS = 50_000;
const SAMPLE_QUERIES = ['ana', 'soporte', 'lilina', 'noc', 'usuario49999'];

function env(name, fallback) {
  return process.env[name] ?? fallback;
}

async function main() {
  const client = new pg.Client({
    host: env('DB_HOST', '127.0.0.1'),
    port: Number(env('DB_PORT', '5433')),
    user: env('DB_USER', 'iwana'),
    password: env('DB_PASSWORD', 'iwana'),
    database: env('DB_NAME', 'dbiw'),
  });
  await client.connect();

  const schema = 'tenant_bench_h05';
  console.log(`schema=${schema} target=${TARGET_ROWS}`);

  await client.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
  await client.query(`SET search_path TO ${schema}, public`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) NOT NULL,
      email_hmac VARCHAR(64) NOT NULL,
      password_hash VARCHAR(255) NOT NULL DEFAULT 'x',
      role VARCHAR(40) NOT NULL DEFAULT 'NOC',
      status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
      tenant_id UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001',
      first_name VARCHAR(100),
      last_name VARCHAR(100),
      job_title VARCHAR(120),
      deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const { rows: countRows } = await client.query(`SELECT COUNT(*)::int AS c FROM users`);
  let count = countRows[0].c;
  if (count < TARGET_ROWS) {
    console.log(`Sembrando ${TARGET_ROWS - count} filas…`);
    const batch = 2000;
    while (count < TARGET_ROWS) {
      const n = Math.min(batch, TARGET_ROWS - count);
      const values = [];
      const params = [];
      let p = 1;
      for (let i = 0; i < n; i++) {
        const idx = count + i;
        values.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
        params.push(
          `user${idx}@bench.local`,
          idx.toString(16).padStart(64, '0'),
          `Nombre${idx % 200}`,
          `Apellido${idx % 300}`,
          idx % 7 === 0 ? 'Soporte tecnico' : idx % 5 === 0 ? 'NOC' : 'Operaciones',
          null,
        );
      }
      await client.query(
        `INSERT INTO users (email, email_hmac, first_name, last_name, job_title, deleted_at)
         VALUES ${values.join(',')}`,
        params,
      );
      count += n;
    }
  }

  // Baseline in-memory (simula pre H-05): cargar todo + filter JS
  const tLoad0 = performance.now();
  const { rows: allRows } = await client.query(
    `SELECT id, email, first_name, last_name, job_title FROM users WHERE deleted_at IS NULL`,
  );
  const loadMs = performance.now() - tLoad0;

  function normalize(v) {
    return String(v ?? '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim();
  }

  function measureBefore(q) {
    const nq = normalize(q);
    const t0 = performance.now();
    const filtered = allRows.filter((r) => {
      const hay = [r.first_name, r.last_name, r.email, r.job_title].map(normalize).join(' ');
      return hay.includes(nq);
    });
    return { ms: performance.now() - t0, n: filtered.length };
  }

  // Índices trgm (post)
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_bench_users_email_trgm ON users USING GIN (email gin_trgm_ops)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_bench_users_fn_trgm ON users USING GIN (first_name gin_trgm_ops)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_bench_users_ln_trgm ON users USING GIN (last_name gin_trgm_ops)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_bench_users_jt_trgm ON users USING GIN (job_title gin_trgm_ops)`,
  );
  await client.query(`ANALYZE users`);

  async function measureAfter(q) {
    const nq = normalize(q);
    const like = `%${nq}%`;
    await client.query(`SELECT set_config('pg_trgm.similarity_threshold', '0.35', true)`);
    const t0 = performance.now();
    const { rows } = await client.query(
      `SELECT id FROM users
        WHERE deleted_at IS NULL
          AND (
            email ILIKE $2 ESCAPE '\\'
            OR coalesce(first_name,'') ILIKE $2 ESCAPE '\\'
            OR coalesce(last_name,'') ILIKE $2 ESCAPE '\\'
            OR coalesce(job_title,'') ILIKE $2 ESCAPE '\\'
            OR email % $1
            OR coalesce(first_name,'') % $1
            OR coalesce(last_name,'') % $1
            OR coalesce(job_title,'') % $1
          )
        ORDER BY id ASC
        LIMIT 51`,
      [nq, like],
    );
    return { ms: performance.now() - t0, n: rows.length };
  }

  console.log(`\nFilas=${count}  load_all_ms=${loadMs.toFixed(1)}`);
  console.log('query | before_ms | after_ms | before_n | after_n');
  for (const q of SAMPLE_QUERIES) {
    const b = measureBefore(q);
    const a = await measureAfter(q);
    console.log(
      `${q.padEnd(12)} | ${b.ms.toFixed(1).padStart(9)} | ${a.ms.toFixed(1).padStart(8)} | ${String(b.n).padStart(8)} | ${String(a.n).padStart(7)}`,
    );
  }

  const keep = env('KEEP_BENCH_SCHEMA', '') === '1';
  if (keep) {
    console.log(
      `\nKEEP_BENCH_SCHEMA=1 → se conserva ${schema} (huérfano; no está en public.tenants)`,
    );
  } else {
    await client.query(`RESET search_path`);
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    console.log(`\nLimpieza: DROP SCHEMA ${schema} CASCADE`);
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
