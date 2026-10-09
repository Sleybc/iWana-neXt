-- Rol de solo lectura para el MCP `postgres-dev` de Claude Code.
-- SOLO base de desarrollo: lo aplica scripts/db/dev-readonly-role.mjs, que se niega
-- a correr fuera del contenedor de dev. Nunca se incluye en apply-least-privilege.sql
-- ni en migraciones (decisión 2026-10-09, INFORME-CLAUDE-CODE-AUTOMATIZACIONES).
--
-- Idempotente: reaplicar re-sincroniza permisos, incluidos schemas tenant nuevos.
-- Variables psql: :'readonly_pass'.

SELECT 'CREATE ROLE iwana_readonly'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'iwana_readonly')
\gexec

ALTER ROLE iwana_readonly WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION
  NOBYPASSRLS NOINHERIT CONNECTION LIMIT 3 PASSWORD :'readonly_pass';
ALTER ROLE iwana_readonly SET default_transaction_read_only = on;
ALTER ROLE iwana_readonly SET statement_timeout = '15s';

SELECT format('GRANT CONNECT ON DATABASE %I TO iwana_readonly', current_database())
\gexec

-- SELECT por columna en public y tenant_*, excluyendo credenciales (password_*,
-- mfa_secret, *_token, token_hash) y PII cifrada o derivada (*_encrypted, *_hash).
-- Revocar a nivel tabla elimina también los permisos de columna previos.
DO $$
DECLARE
  sch record;
  rel record;
  cols text;
BEGIN
  FOR sch IN
    SELECT nspname FROM pg_namespace
    WHERE nspname = 'public' OR nspname ~ '^tenant_[a-z][a-z0-9_]{0,54}$'
  LOOP
    EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM iwana_readonly', sch.nspname);
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO iwana_readonly', sch.nspname);

    FOR rel IN
      SELECT c.oid, c.relname FROM pg_class c
      WHERE c.relnamespace = sch.nspname::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm')
    LOOP
      SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum) INTO cols
      FROM pg_attribute a
      WHERE a.attrelid = rel.oid AND a.attnum > 0 AND NOT a.attisdropped
        AND a.attname !~* '(password|secret|token|recovery|_encrypted$|_hash$)';

      IF cols IS NOT NULL THEN
        EXECUTE format('GRANT SELECT (%s) ON %I.%I TO iwana_readonly', cols, sch.nspname, rel.relname);
      END IF;
    END LOOP;
  END LOOP;
END
$$;
