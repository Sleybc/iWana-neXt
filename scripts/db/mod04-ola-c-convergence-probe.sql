-- Convergencia MOD04 Ola C (D-1 / H-03 + D-2 índices):
-- Schema sintético partiendo del DDL de `000` (users) + DDL de `083`/`084`
-- vs tenant ACTIVE preexistente. Sin PII. Se limpia al final.

\set ON_ERROR_STOP on

DROP SCHEMA IF EXISTS tenant_mod04_ola_c_conv CASCADE;
CREATE SCHEMA tenant_mod04_ola_c_conv;
SET search_path TO tenant_mod04_ola_c_conv, public;

-- DDL mínimo de users como en 000_initial_tenant_schema (subset relevante)
CREATE TABLE users (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  email VARCHAR(512) NOT NULL,
  email_hmac VARCHAR(64) NOT NULL,
  password_hash VARCHAR(60) NOT NULL,
  role VARCHAR(20) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING_VERIFICATION',
  tenant_id UUID NOT NULL,
  mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  mfa_secret VARCHAR(512),
  mfa_required BOOLEAN NOT NULL DEFAULT FALSE,
  password_reset_required BOOLEAN NOT NULL DEFAULT FALSE,
  password_reset_token VARCHAR(512),
  password_reset_expires_at TIMESTAMPTZ,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  email_verification_token VARCHAR(512),
  first_name VARCHAR(512),
  last_name VARCHAR(512),
  phone VARCHAR(20),
  job_title VARCHAR(150),
  document_type VARCHAR(20),
  document_number VARCHAR(512),
  avatar_url VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_users PRIMARY KEY (id),
  CONSTRAINT uq_users_email_hmac UNIQUE (email_hmac)
);

-- 083 (idempotente, equivalente a AlignUsersEntityDdl083)
DO $$
BEGIN
  ALTER TABLE users ALTER COLUMN email TYPE VARCHAR(255);
  ALTER TABLE users ALTER COLUMN first_name TYPE VARCHAR(100);
  ALTER TABLE users ALTER COLUMN last_name TYPE VARCHAR(100);
  ALTER TABLE users ALTER COLUMN document_number TYPE VARCHAR(30);
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_users_email' AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE users ADD CONSTRAINT uq_users_email UNIQUE (email);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_users_first_name ON users (first_name);
CREATE INDEX IF NOT EXISTS idx_users_last_name ON users (last_name);

-- 084
CREATE INDEX IF NOT EXISTS idx_users_first_name_trgm ON users USING GIN (first_name public.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_users_last_name_trgm ON users USING GIN (last_name public.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_users_email_trgm ON users USING GIN (email public.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_users_job_title_trgm ON users USING GIN (job_title public.gin_trgm_ops);

RESET search_path;

WITH snaps AS (
  SELECT
    s.schema_name,
    MAX(CASE WHEN col.column_name = 'email' THEN col.character_maximum_length END) AS email_len,
    MAX(CASE WHEN col.column_name = 'first_name' THEN col.character_maximum_length END) AS first_len,
    MAX(CASE WHEN col.column_name = 'last_name' THEN col.character_maximum_length END) AS last_len,
    MAX(CASE WHEN col.column_name = 'document_number' THEN col.character_maximum_length END) AS doc_len,
    EXISTS (
      SELECT 1
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = rel.relnamespace
      WHERE n.nspname = s.schema_name
        AND rel.relname = 'users'
        AND con.conname = 'uq_users_email'
        AND con.contype = 'u'
    ) AS has_uq_users_email,
    to_regclass(format('%I.idx_users_first_name', s.schema_name)) IS NOT NULL AS has_idx_first_name,
    to_regclass(format('%I.idx_users_last_name', s.schema_name)) IS NOT NULL AS has_idx_last_name,
    to_regclass(format('%I.idx_users_email_trgm', s.schema_name)) IS NOT NULL AS has_idx_email_trgm
  FROM (
    SELECT schema_name FROM public.tenants WHERE status = 'ACTIVE'
    UNION ALL
    SELECT 'tenant_mod04_ola_c_conv'
  ) s
  JOIN information_schema.columns col
    ON col.table_schema = s.schema_name
   AND col.table_name = 'users'
   AND col.column_name IN ('email', 'first_name', 'last_name', 'document_number')
  GROUP BY s.schema_name
)
SELECT * FROM snaps ORDER BY schema_name;

-- Veredicto: si hay más de un fingerprint distinto → FAIL
WITH snaps AS (
  SELECT
    s.schema_name,
    format(
      '%s|%s|%s|%s|%s|%s|%s|%s',
      MAX(CASE WHEN col.column_name = 'email' THEN col.character_maximum_length END),
      MAX(CASE WHEN col.column_name = 'first_name' THEN col.character_maximum_length END),
      MAX(CASE WHEN col.column_name = 'last_name' THEN col.character_maximum_length END),
      MAX(CASE WHEN col.column_name = 'document_number' THEN col.character_maximum_length END),
      EXISTS (
        SELECT 1 FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = rel.relnamespace
        WHERE n.nspname = s.schema_name AND rel.relname = 'users'
          AND con.conname = 'uq_users_email' AND con.contype = 'u'
      ),
      to_regclass(format('%I.idx_users_first_name', s.schema_name)) IS NOT NULL,
      to_regclass(format('%I.idx_users_last_name', s.schema_name)) IS NOT NULL,
      to_regclass(format('%I.idx_users_email_trgm', s.schema_name)) IS NOT NULL
    ) AS fp
  FROM (
    SELECT schema_name FROM public.tenants WHERE status = 'ACTIVE'
    UNION ALL
    SELECT 'tenant_mod04_ola_c_conv'
  ) s
  JOIN information_schema.columns col
    ON col.table_schema = s.schema_name
   AND col.table_name = 'users'
   AND col.column_name IN ('email', 'first_name', 'last_name', 'document_number')
  GROUP BY s.schema_name
)
SELECT COUNT(DISTINCT fp) AS distinct_fingerprints,
       CASE WHEN COUNT(DISTINCT fp) = 1 THEN 'OK_CONVERGENCE' ELSE 'FAIL_CONVERGENCE' END AS verdict
FROM snaps;

DROP SCHEMA IF EXISTS tenant_mod04_ola_c_conv CASCADE;
