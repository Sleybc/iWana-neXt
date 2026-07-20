-- SEC-04 — Aplicar least privilege en un volumen ya inicializado (idempotente).
-- Ejecutar como bootstrap/superuser (p. ej. iwana / POSTGRES_USER):
--
--   docker exec -i iwana_postgres_dev psql -U iwana -d dbiw < scripts/db/apply-least-privilege.sql
--
-- Por defecto crea iwana_app / iwana_migrator con el mismo password que el
-- usuario de la sesión (solo lab). En staging/prod: crear roles a mano con
-- passwords distintos ANTES de correr la parte de ownership, o ajusta los
-- \set de abajo.
--
-- Incluye (orden): roles → event trigger audit → ownership audit → ownership
-- DDL de negocio (tablas/secuencias/enums/schemas tenant → migrator) → DML
-- app → ledger typeorm_migrations.
--
-- No imprime secretos. No toca datos de negocio.

\set ON_ERROR_STOP on
\set app_user 'iwana_app'
\set migrator_user 'iwana_migrator'

-- Password de lab: reutilizar el del rol actual vía ALTER no es portable;
-- CREATE ROLE exige password. Si el rol ya existe, se omite CREATE.
-- Para primer create en lab, define vía:
--   psql ... -v app_pass='...' -v migrator_pass='...'
-- Si no pasas -v, se usa un password local obvio SOLO para desarrollo —
-- cámbialo antes de cualquier dato sensible.
\if :{?app_pass}
\else
\set app_pass 'changeme-dev-only-app'
\endif
\if :{?migrator_pass}
\else
\set migrator_pass 'changeme-dev-only-migrator'
\endif

SELECT format(
  'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT',
  :'app_user',
  :'app_pass'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user')
\gexec

SELECT format(
  'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT',
  :'migrator_user',
  :'migrator_pass'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'migrator_user')
\gexec

SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'app_user')
\gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'migrator_user')
\gexec
SELECT format('GRANT CREATE ON DATABASE %I TO %I', current_database(), :'app_user')
\gexec
SELECT format('GRANT CREATE ON DATABASE %I TO %I', current_database(), :'migrator_user')
\gexec

GRANT USAGE, CREATE ON SCHEMA public TO :"app_user";
GRANT USAGE, CREATE ON SCHEMA public TO :"migrator_user";

-- Función + event trigger (misma lógica que docker/postgres/init/02-*.sql)
CREATE OR REPLACE FUNCTION public.iwana_reassign_audit_table_owner()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  obj record;
  migrator_role text := 'iwana_migrator';
  current_owner name;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = migrator_role) THEN
    RETURN;
  END IF;

  FOR obj IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'ALTER TABLE')
      AND object_type = 'table'
  LOOP
    IF obj.object_identity ~* '\.(platform_audit_logs|audit_logs)$' THEN
      -- Evitar recursión: ALTER OWNER dispara de nuevo este event trigger.
      SELECT pg_get_userbyid(c.relowner) INTO current_owner
      FROM pg_class c
      WHERE c.oid = obj.objid;

      IF current_owner IS DISTINCT FROM migrator_role THEN
        EXECUTE format('ALTER TABLE %s OWNER TO %I', obj.object_identity, migrator_role);
      END IF;
    END IF;
  END LOOP;
END;
$$;

DROP EVENT TRIGGER IF EXISTS trg_reassign_audit_owner;
CREATE EVENT TRIGGER trg_reassign_audit_owner
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'ALTER TABLE')
  EXECUTE FUNCTION public.iwana_reassign_audit_table_owner();

DO $body$
DECLARE
  r record;
  migrator text := 'iwana_migrator';
  app text := 'iwana_app';
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'reject_audit_mutation'
  ) THEN
    EXECUTE format('ALTER FUNCTION public.reject_audit_mutation() OWNER TO %I', migrator);
  END IF;

  IF to_regclass('public.platform_audit_logs') IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.platform_audit_logs OWNER TO %I', migrator);
    EXECUTE format('REVOKE ALL ON TABLE public.platform_audit_logs FROM PUBLIC');
    EXECUTE format('REVOKE ALL ON TABLE public.platform_audit_logs FROM %I', app);
    EXECUTE format(
      'GRANT SELECT, INSERT ON TABLE public.platform_audit_logs TO %I',
      app
    );
    -- migrator: control total como dueño (implícito); grant explícito por claridad
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.platform_audit_logs TO %I',
      migrator
    );
    -- 014/075 dejan RLS ENABLE sin políticas; con owner ≠ runtime eso deniega
    -- INSERT. La inmutabilidad es el trigger, no RLS.
    EXECUTE 'ALTER TABLE public.platform_audit_logs DISABLE ROW LEVEL SECURITY';
  END IF;

  FOR r IN
    SELECT n.nspname AS schema_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r'
      AND c.relname = 'audit_logs'
      AND n.nspname <> 'pg_catalog'
      AND n.nspname <> 'information_schema'
  LOOP
    EXECUTE format('ALTER TABLE %I.audit_logs OWNER TO %I', r.schema_name, migrator);
    EXECUTE format('REVOKE ALL ON TABLE %I.audit_logs FROM PUBLIC', r.schema_name);
    EXECUTE format('REVOKE ALL ON TABLE %I.audit_logs FROM %I', r.schema_name, app);
    EXECUTE format(
      'GRANT SELECT, INSERT ON TABLE %I.audit_logs TO %I',
      r.schema_name,
      app
    );
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE %I.audit_logs TO %I',
      r.schema_name,
      migrator
    );
    EXECUTE format(
      'ALTER TABLE %I.audit_logs DISABLE ROW LEVEL SECURITY',
      r.schema_name
    );
    -- USAGE en schema tenant para que la app pueda INSERT en audit
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I', r.schema_name, app);
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I', r.schema_name, migrator);
  END LOOP;
END
$body$;

-- Ownership de schema objects → migrator (DDL).
-- GRANT ALL no alcanza: en PostgreSQL ALTER TABLE / ALTER TYPE / CREATE INDEX
-- sobre objetos ajenos exige ser owner (o superuser). Volúmenes inicializados
-- con bootstrap (iwana) dejan tablas/enums owned by iwana; entonces
-- migration:run con DB_MIGRATOR_USER=iwana_migrator falla con
-- `must be owner of table …` (caso típico: public.tenants en 013+).
-- Idempotente: solo reasigna si el owner actual ≠ migrator.
DO $owner$
DECLARE
  r record;
  migrator text := 'iwana_migrator';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = migrator) THEN
    RAISE EXCEPTION 'rol % ausente', migrator;
  END IF;

  FOR r IN
    SELECT n.nspname AS schema_name, c.relname AS rel_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_roles o ON o.oid = c.relowner
    WHERE c.relkind = 'r'
      AND (n.nspname = 'public' OR n.nspname LIKE 'tenant\_%' ESCAPE '\')
      AND o.rolname IS DISTINCT FROM migrator
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I OWNER TO %I',
      r.schema_name,
      r.rel_name,
      migrator
    );
  END LOOP;

  FOR r IN
    SELECT n.nspname AS schema_name, c.relname AS rel_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_roles o ON o.oid = c.relowner
    WHERE c.relkind = 'S'
      AND (n.nspname = 'public' OR n.nspname LIKE 'tenant\_%' ESCAPE '\')
      AND o.rolname IS DISTINCT FROM migrator
  LOOP
    EXECUTE format(
      'ALTER SEQUENCE %I.%I OWNER TO %I',
      r.schema_name,
      r.rel_name,
      migrator
    );
  END LOOP;

  FOR r IN
    SELECT n.nspname AS schema_name, t.typname AS typ_name
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    JOIN pg_roles o ON o.oid = t.typowner
    WHERE t.typtype = 'e'
      AND (n.nspname = 'public' OR n.nspname LIKE 'tenant\_%' ESCAPE '\')
      AND o.rolname IS DISTINCT FROM migrator
  LOOP
    EXECUTE format(
      'ALTER TYPE %I.%I OWNER TO %I',
      r.schema_name,
      r.typ_name,
      migrator
    );
  END LOOP;

  -- Schemas tenant: CREATE TABLE / ALTER TYPE en migraciones exige CREATE
  -- (USAGE solo no basta). Ownership del schema evita deriva a bootstrap.
  FOR r IN
    SELECT n.nspname AS schema_name
    FROM pg_namespace n
    JOIN pg_roles o ON o.oid = n.nspowner
    WHERE n.nspname LIKE 'tenant\_%' ESCAPE '\'
      AND o.rolname IS DISTINCT FROM migrator
  LOOP
    EXECUTE format('ALTER SCHEMA %I OWNER TO %I', r.schema_name, migrator);
  END LOOP;
END
$owner$;

-- DML de negocio (runbook): iwana_app lee/escribe tablas operativas.
-- Tablas existentes suelen ser owned by bootstrap (iwana); sin esto el runtime
-- con DB_USER=iwana_app falla (42501). Tras el GRANT amplio se re-endurece audit.
DO $dml$
DECLARE
  r record;
  app text := 'iwana_app';
  migrator text := 'iwana_migrator';
  bootstrap text := current_user;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app) THEN
    RAISE EXCEPTION 'rol % ausente', app;
  END IF;

  FOR r IN
    SELECT n.nspname AS schema_name
    FROM pg_namespace n
    WHERE n.nspname = 'public'
       OR n.nspname LIKE 'tenant\_%' ESCAPE '\'
  LOOP
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I', r.schema_name, app);
    -- Migrator necesita CREATE en schemas tenant para DDL (CREATE TABLE IF NOT
    -- EXISTS del ledger, nuevas tablas/enums). App: solo USAGE.
    EXECUTE format(
      'GRANT USAGE, CREATE ON SCHEMA %I TO %I',
      r.schema_name,
      migrator
    );

    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO %I',
      r.schema_name,
      app
    );
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA %I TO %I',
      r.schema_name,
      migrator
    );
    EXECUTE format(
      'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO %I',
      r.schema_name,
      app
    );
    EXECUTE format(
      'GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA %I TO %I',
      r.schema_name,
      migrator
    );

    -- Futuro: objetos creados por migrator / bootstrap heredan DML a la app
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
      migrator,
      r.schema_name,
      app
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT USAGE, SELECT ON SEQUENCES TO %I',
      migrator,
      r.schema_name,
      app
    );
    IF bootstrap IS DISTINCT FROM migrator THEN
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
        bootstrap,
        r.schema_name,
        app
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT USAGE, SELECT ON SEQUENCES TO %I',
        bootstrap,
        r.schema_name,
        app
      );
    END IF;
  END LOOP;

  -- Re-endurecer audit (SELECT/INSERT only; sin UPDATE/DELETE/TRIGGER)
  IF to_regclass('public.platform_audit_logs') IS NOT NULL THEN
    EXECUTE format('REVOKE ALL ON TABLE public.platform_audit_logs FROM %I', app);
    EXECUTE format(
      'GRANT SELECT, INSERT ON TABLE public.platform_audit_logs TO %I',
      app
    );
  END IF;

  FOR r IN
    SELECT n.nspname AS schema_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r'
      AND c.relname = 'audit_logs'
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE %I.audit_logs FROM %I', r.schema_name, app);
    EXECUTE format(
      'GRANT SELECT, INSERT ON TABLE %I.audit_logs TO %I',
      r.schema_name,
      app
    );
  END LOOP;
END
$dml$;

-- Ledger TypeORM: owner suele ser bootstrap (iwana). Sin DML explícito,
-- migration:run/show con DB_MIGRATOR_* falla 42501 si la tabla nació después
-- del GRANT ALL TABLES (default privileges previos solo daban a iwana_app).
-- Cubre public + cada schema con typeorm_migrations (tenant_* u otros).
DO $ledger$
DECLARE
  r record;
  seq_reg text;
  migrator text := 'iwana_migrator';
  bootstrap text := current_user;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = migrator) THEN
    RAISE EXCEPTION 'rol % ausente', migrator;
  END IF;

  FOR r IN
    SELECT n.nspname AS schema_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r'
      AND c.relname = 'typeorm_migrations'
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  LOOP
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I', r.schema_name, migrator);
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I.typeorm_migrations TO %I',
      r.schema_name,
      migrator
    );

    seq_reg := pg_get_serial_sequence(
      format('%I.%I', r.schema_name, 'typeorm_migrations'),
      'id'
    );
    IF seq_reg IS NOT NULL THEN
      EXECUTE format(
        'GRANT USAGE, SELECT, UPDATE ON SEQUENCE %s TO %I',
        seq_reg,
        migrator
      );
    END IF;
  END LOOP;

  -- Futuro: tablas/secuencias creadas por bootstrap → DML al migrator
  -- (evita 42501 en typeorm_migrations tras migration:run como iwana).
  FOR r IN
    SELECT n.nspname AS schema_name
    FROM pg_namespace n
    WHERE n.nspname = 'public'
       OR n.nspname LIKE 'tenant\_%' ESCAPE '\'
  LOOP
    IF bootstrap IS DISTINCT FROM migrator THEN
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
        bootstrap,
        r.schema_name,
        migrator
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO %I',
        bootstrap,
        r.schema_name,
        migrator
      );
    END IF;
  END LOOP;
END
$ledger$;

\echo 'SEC-04 apply-least-privilege: OK (revisar ownership con verify script)'
