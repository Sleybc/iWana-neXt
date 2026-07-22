-- Verifica 083 up/down en schema sintético (no toca tenants reales).
\set ON_ERROR_STOP on

DROP SCHEMA IF EXISTS tenant_mod04_083_rev CASCADE;
CREATE SCHEMA tenant_mod04_083_rev;
SET search_path TO tenant_mod04_083_rev, public;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(512) NOT NULL,
  email_hash VARCHAR(64) NOT NULL UNIQUE,
  first_name VARCHAR(512),
  last_name VARCHAR(512),
  document_number VARCHAR(512)
);

-- UP (083)
ALTER TABLE users ALTER COLUMN email TYPE VARCHAR(255);
ALTER TABLE users ALTER COLUMN first_name TYPE VARCHAR(100);
ALTER TABLE users ALTER COLUMN last_name TYPE VARCHAR(100);
ALTER TABLE users ALTER COLUMN document_number TYPE VARCHAR(30);
ALTER TABLE users ADD CONSTRAINT uq_users_email UNIQUE (email);
CREATE INDEX idx_users_first_name ON users (first_name);
CREATE INDEX idx_users_last_name ON users (last_name);

SELECT 'after_up' AS phase,
  MAX(CASE WHEN column_name='email' THEN character_maximum_length END) AS email_len,
  MAX(CASE WHEN column_name='first_name' THEN character_maximum_length END) AS first_len,
  MAX(CASE WHEN column_name='last_name' THEN character_maximum_length END) AS last_len,
  MAX(CASE WHEN column_name='document_number' THEN character_maximum_length END) AS doc_len,
  to_regclass('tenant_mod04_083_rev.idx_users_first_name') IS NOT NULL AS idx_fn,
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname='uq_users_email' AND conrelid='users'::regclass) AS uq_email
FROM information_schema.columns
WHERE table_schema=current_schema() AND table_name='users'
  AND column_name IN ('email','first_name','last_name','document_number');

-- DOWN (083)
DROP INDEX IF EXISTS idx_users_last_name;
DROP INDEX IF EXISTS idx_users_first_name;
ALTER TABLE users DROP CONSTRAINT IF EXISTS uq_users_email;
ALTER TABLE users ALTER COLUMN email TYPE VARCHAR(512);
ALTER TABLE users ALTER COLUMN first_name TYPE VARCHAR(512);
ALTER TABLE users ALTER COLUMN last_name TYPE VARCHAR(512);
ALTER TABLE users ALTER COLUMN document_number TYPE VARCHAR(512);

SELECT 'after_down' AS phase,
  MAX(CASE WHEN column_name='email' THEN character_maximum_length END) AS email_len,
  MAX(CASE WHEN column_name='first_name' THEN character_maximum_length END) AS first_len,
  MAX(CASE WHEN column_name='last_name' THEN character_maximum_length END) AS last_len,
  MAX(CASE WHEN column_name='document_number' THEN character_maximum_length END) AS doc_len,
  to_regclass('tenant_mod04_083_rev.idx_users_first_name') IS NOT NULL AS idx_fn,
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname='uq_users_email' AND conrelid='users'::regclass) AS uq_email
FROM information_schema.columns
WHERE table_schema=current_schema() AND table_name='users'
  AND column_name IN ('email','first_name','last_name','document_number');

RESET search_path;
DROP SCHEMA IF EXISTS tenant_mod04_083_rev CASCADE;
