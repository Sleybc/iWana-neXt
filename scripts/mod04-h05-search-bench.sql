-- H-05 bench: siembra y mide (ejecutar vía psql). Schema aislado.
\set ON_ERROR_STOP on
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE SCHEMA IF NOT EXISTS tenant_bench_h05;
SET search_path TO tenant_bench_h05, public;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  email_hmac VARCHAR(64) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  job_title VARCHAR(120),
  deleted_at TIMESTAMPTZ
);

DO $$
DECLARE
  c int;
  i int;
BEGIN
  SELECT COUNT(*) INTO c FROM users;
  IF c < 50000 THEN
    FOR i IN c..(49999) LOOP
      INSERT INTO users (email, email_hmac, first_name, last_name, job_title)
      VALUES (
        'user' || i || '@bench.local',
        lpad(to_hex(i), 64, '0'),
        'Nombre' || (i % 200),
        'Apellido' || (i % 300),
        CASE WHEN i % 7 = 0 THEN 'Soporte tecnico' WHEN i % 5 = 0 THEN 'NOC' ELSE 'Operaciones' END
      );
    END LOOP;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bench_users_email_trgm ON users USING GIN (email public.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_bench_users_fn_trgm ON users USING GIN (first_name public.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_bench_users_ln_trgm ON users USING GIN (last_name public.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_bench_users_jt_trgm ON users USING GIN (job_title public.gin_trgm_ops);
ANALYZE users;

\echo === ROW COUNT ===
SELECT COUNT(*) AS rows FROM users;

\echo === BEFORE (full scan + filter in SQL without index use hint: seq) ===
-- Simula coste de "cargar tabla": SELECT count filter sin trigram index (disable seqscan off, bitmap)
SET enable_bitmapscan = off;
SET enable_indexscan = off;
SET enable_indexonlyscan = off;
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id FROM users
 WHERE deleted_at IS NULL
   AND (
     email ILIKE '%ana%' OR first_name ILIKE '%ana%' OR last_name ILIKE '%ana%' OR job_title ILIKE '%ana%'
   )
 LIMIT 51;

\echo === AFTER (trgm enabled) ===
SET enable_bitmapscan = on;
SET enable_indexscan = on;
SET enable_indexonlyscan = on;
SELECT set_config('pg_trgm.similarity_threshold', '0.35', true);
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id FROM users
 WHERE deleted_at IS NULL
   AND (
     email ILIKE '%ana%' OR coalesce(first_name,'') ILIKE '%ana%'
     OR coalesce(last_name,'') ILIKE '%ana%' OR coalesce(job_title,'') ILIKE '%ana%'
     OR email % 'ana' OR coalesce(first_name,'') % 'ana'
     OR coalesce(last_name,'') % 'ana' OR coalesce(job_title,'') % 'ana'
   )
 ORDER BY id ASC
 LIMIT 51;

\timing on
\echo === TIMING before-like seq ===
SET enable_bitmapscan = off; SET enable_indexscan = off;
SELECT COUNT(*) FROM users WHERE deleted_at IS NULL AND (email ILIKE '%soporte%' OR first_name ILIKE '%soporte%' OR last_name ILIKE '%soporte%' OR job_title ILIKE '%soporte%');

\echo === TIMING after trgm ===
SET enable_bitmapscan = on; SET enable_indexscan = on;
SELECT COUNT(*) FROM users WHERE deleted_at IS NULL AND (email ILIKE '%soporte%' OR coalesce(first_name,'') ILIKE '%soporte%' OR coalesce(last_name,'') ILIKE '%soporte%' OR coalesce(job_title,'') ILIKE '%soporte%' OR email % 'soporte' OR coalesce(job_title,'') % 'soporte');

-- Schema de bench: huérfano (no en public.tenants). Se elimina al terminar para no ensuciar scans H-14.
-- Para conservar tras medir, usar el .mjs con KEEP_BENCH_SCHEMA=1 en lugar de este .sql.
\echo === CLEANUP ===
RESET search_path;
DROP SCHEMA IF EXISTS tenant_bench_h05 CASCADE;
