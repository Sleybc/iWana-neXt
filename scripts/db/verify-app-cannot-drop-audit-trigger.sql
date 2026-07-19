-- SEC-04 — Verifica que iwana_app NO puede DROP TRIGGER de audit inmutable.
-- Ejecutar como bootstrap (iwana):
--
--   docker exec -i iwana_postgres_dev psql -U iwana -d dbiw \
--     < scripts/db/verify-app-cannot-drop-audit-trigger.sql
--
-- PASS = el DROP falla con insufficient_privilege (42501).
-- FAIL = el DROP tiene éxito, o el error no es de privilegios (GSEC-06).

\set ON_ERROR_STOP off

DO $verify$
DECLARE
  app text := 'iwana_app';
  drop_succeeded boolean := false;
  err_text text;
  err_state text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app) THEN
    RAISE EXCEPTION 'FAIL: rol % no existe — corre apply-least-privilege.sql antes', app;
  END IF;

  IF to_regclass('public.platform_audit_logs') IS NULL THEN
    RAISE EXCEPTION 'FAIL: public.platform_audit_logs no existe — corre migraciones public';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'platform_audit_logs'
      AND t.tgname = 'trg_platform_audit_logs_immutable'
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'FAIL: trigger trg_platform_audit_logs_immutable ausente — migración 014';
  END IF;

  -- Comprobar owner ≠ app
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_roles r ON r.oid = c.relowner
    WHERE n.nspname = 'public'
      AND c.relname = 'platform_audit_logs'
      AND r.rolname = app
  ) THEN
    RAISE EXCEPTION 'FAIL: platform_audit_logs sigue owned by %', app;
  END IF;

  BEGIN
    EXECUTE format('SET LOCAL ROLE %I', app);
    EXECUTE 'DROP TRIGGER trg_platform_audit_logs_immutable ON public.platform_audit_logs';
    drop_succeeded := true;
  EXCEPTION
    -- Solo privilegios insuficientes cuentan como PASS (SQLSTATE 42501).
    -- WHEN OTHERS enmascaraba fallos ajenos (GSEC-06).
    WHEN insufficient_privilege THEN
      err_text := SQLERRM;
      err_state := SQLSTATE;
      drop_succeeded := false;
    WHEN OTHERS THEN
      err_text := SQLERRM;
      err_state := SQLSTATE;
      EXECUTE 'RESET ROLE';
      RAISE EXCEPTION
        'FAIL: error inesperado al probar DROP TRIGGER (esperado 42501): % [%]',
        err_text,
        err_state;
  END;

  EXECUTE 'RESET ROLE';

  IF drop_succeeded THEN
    RAISE EXCEPTION 'FAIL: iwana_app pudo DROP TRIGGER trg_platform_audit_logs_immutable';
  END IF;

  RAISE NOTICE 'PASS: iwana_app no puede DROP TRIGGER (% ) [%]', err_text, err_state;
END
$verify$;
