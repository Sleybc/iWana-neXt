-- SEC-04 — Event trigger + función para reasignar ownership de tablas audit.
-- Corre en init (datadir vacío): las tablas aún no existen; el trigger actúa
-- cuando migraciones/provisioning creen platform_audit_logs / audit_logs.
--
-- Roles esperados: iwana_app, iwana_migrator (01-create-roles.sh).
-- Owner objetivo de audit: iwana_migrator.
-- Ledger typeorm_migrations: grants en 01 (default privileges) + apply-least-privilege.sql
-- (bloque $ledger$ explícito en public y schemas tenant).

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

COMMENT ON FUNCTION public.iwana_reassign_audit_table_owner() IS
  'SEC-04: reasigna ownership de tablas audit a iwana_migrator tras CREATE/ALTER TABLE.';

DROP EVENT TRIGGER IF EXISTS trg_reassign_audit_owner;
CREATE EVENT TRIGGER trg_reassign_audit_owner
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'ALTER TABLE')
  EXECUTE FUNCTION public.iwana_reassign_audit_table_owner();

-- La función de rechazo de mutaciones (migración 014) también debe quedar
-- bajo migrator cuando exista; el script apply lo cubre en volúmenes viejos.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'reject_audit_mutation'
  ) AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'iwana_migrator') THEN
    EXECUTE 'ALTER FUNCTION public.reject_audit_mutation() OWNER TO iwana_migrator';
  END IF;
END $$;
