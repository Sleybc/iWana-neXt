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
    -- USAGE en schema tenant para que la app pueda INSERT en audit
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I', r.schema_name, app);
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I', r.schema_name, migrator);
  END LOOP;
END
$body$;

\echo 'SEC-04 apply-least-privilege: OK (revisar ownership con verify script)'
