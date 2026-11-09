import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración public 029 (R7, ADR-108): purga de tenants con mínimo privilegio y reloj
 * de retención honesto.
 *
 * ### El defecto que cierra
 *
 * La purga programada se conectaba como `iwana_app` y hacía `DROP SCHEMA` sobre
 * esquemas cuyo dueño es `iwana_migrator`: fallaba siempre con `must be owner of
 * schema` (spec 2026-11-09-plat-ops-r7 §1).
 *
 * ### Qué crea
 *
 * 1. `public.iwana_list_purge_candidates(int, int)` y `public.iwana_purge_tenant_schema(uuid,
 *    int)`, ambas `SECURITY DEFINER` con dueño el rol que migra (`iwana_migrator`) y
 *    `search_path = pg_catalog, public, pg_temp`. Imponen en la base las reglas de
 *    elegibilidad: tenant marcado, piso de 30 días, nombre válido, esquema del migrator,
 *    exclusión de `tenant_iwana` y ausencia de dependencias desde otros esquemas.
 *    `EXECUTE` solo para `iwana_purger`; si el rol no existe, nadie la puede ejecutar y
 *    la purga falla de forma visible (nunca se abren permisos por omisión).
 * 2. `public.iwana_tenants_deletion_clock()` y su trigger en `public.tenants`
 *    (`SECURITY INVOKER`). Para quien no pertenece a `iwana_migrator` (medido con
 *    `session_user`, que `SET ROLE` no cambia): fija la marca de borrado en `now()`,
 *    impide cambiar `id` y `schema_name`, rechaza altas sobre un esquema existente y
 *    audita cada marca. Sin el rol `iwana_migrator` (lab de compatibilidad) conserva el
 *    comportamiento anterior, igual que la 024.
 *
 * Reversible: `down()` retira el trigger y las tres funciones.
 */
export class TenantSchemaPurgeDefiner1784419217000 implements MigrationInterface {
  name = 'TenantSchemaPurgeDefiner1784419217000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.iwana_list_purge_candidates(
        p_min_retention_days integer,
        p_limit integer
      )
      RETURNS SETOF uuid
      LANGUAGE plpgsql
      STABLE
      SECURITY DEFINER
      SET search_path = pg_catalog, public, pg_temp
      AS $fn$
      BEGIN
        RETURN QUERY
          SELECT t.id
            FROM public.tenants t
           WHERE t.status = 'MARKED_FOR_DELETION'
             AND t.deleted_at IS NOT NULL
             AND t.deleted_at <= pg_catalog.now()
                 - pg_catalog.make_interval(days => GREATEST(p_min_retention_days, 30))
             AND t.schema_name <> 'tenant_iwana'
           ORDER BY t.deleted_at ASC
           LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
      END;
      $fn$
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.iwana_purge_tenant_schema(
        p_tenant_id uuid,
        p_min_retention_days integer
      )
      RETURNS text
      LANGUAGE plpgsql
      VOLATILE
      SECURITY DEFINER
      SET search_path = pg_catalog, public, pg_temp
      SET lock_timeout = '5s'
      SET statement_timeout = '10min'
      AS $fn$
      DECLARE
        v_tenant public.tenants%ROWTYPE;
        v_retention integer := GREATEST(p_min_retention_days, 30);
        v_nsp oid;
        v_owner name;
        v_actor text := session_user;
      BEGIN
        IF p_tenant_id IS NULL THEN
          RETURN 'SKIPPED_GONE';
        END IF;

        -- 1. Lock por id (no por el nombre leído sin bloquear la fila).
        IF NOT pg_catalog.pg_try_advisory_xact_lock(43, pg_catalog.hashtext(p_tenant_id::text)) THEN
          RETURN 'SKIPPED_LOCKED';
        END IF;

        -- 2. Fila bloqueada antes de cualquier DDL: cierra la carrera con la reactivación.
        BEGIN
          SELECT * INTO v_tenant FROM public.tenants WHERE id = p_tenant_id FOR UPDATE NOWAIT;
        EXCEPTION WHEN lock_not_available THEN
          RETURN 'SKIPPED_LOCKED';
        END;
        IF NOT FOUND THEN
          RETURN 'SKIPPED_GONE';
        END IF;

        -- 3. Elegibilidad, siempre sobre la fila ya bloqueada.
        IF v_tenant.status IS DISTINCT FROM 'MARKED_FOR_DELETION' OR v_tenant.deleted_at IS NULL THEN
          RAISE EXCEPTION 'TENANT_PURGE_NOT_MARKED' USING ERRCODE = 'P0001';
        END IF;
        IF v_tenant.deleted_at > pg_catalog.now() - pg_catalog.make_interval(days => v_retention) THEN
          RAISE EXCEPTION 'TENANT_PURGE_RETENTION_NOT_MET' USING ERRCODE = 'P0001';
        END IF;
        -- Misma expresión que isValidSchemaName (packages/database/src/data-source.ts).
        IF v_tenant.schema_name !~ '^tenant_[a-z][a-z0-9_]{0,54}$' THEN
          RAISE EXCEPTION 'TENANT_PURGE_INVALID_SCHEMA_NAME' USING ERRCODE = 'P0001';
        END IF;
        IF v_tenant.schema_name = 'tenant_iwana' THEN
          RAISE EXCEPTION 'TENANT_PURGE_PROTECTED_SCHEMA' USING ERRCODE = 'P0001';
        END IF;

        SELECT n.oid, pg_catalog.pg_get_userbyid(n.nspowner)
          INTO v_nsp, v_owner
          FROM pg_catalog.pg_namespace n
         WHERE n.nspname = v_tenant.schema_name;

        IF v_nsp IS NOT NULL THEN
          IF v_owner IS DISTINCT FROM current_user THEN
            -- current_user dentro del definer es su dueño (el migrator que creó el esquema).
            RAISE EXCEPTION 'TENANT_PURGE_UNEXPECTED_OWNER' USING ERRCODE = 'P0001';
          END IF;

          -- Ningún objeto de otro esquema puede depender del que se borra: CASCADE lo
          -- arrastraría (vistas, FKs, defaults, triggers, funciones). El esquema del
          -- dependiente se resuelve por catálogo, porque pg_identify_object no lo da
          -- para reglas, defaults ni triggers. Si no se puede resolver, cuenta como
          -- externo: la purga falla cerrada en lugar de borrar a ciegas.
          IF EXISTS (
            WITH own AS (
              SELECT 'pg_catalog.pg_class'::regclass AS classid, c.oid AS objid
                FROM pg_catalog.pg_class c WHERE c.relnamespace = v_nsp
              UNION ALL
              SELECT 'pg_catalog.pg_type'::regclass, t.oid
                FROM pg_catalog.pg_type t WHERE t.typnamespace = v_nsp
              UNION ALL
              SELECT 'pg_catalog.pg_proc'::regclass, p.oid
                FROM pg_catalog.pg_proc p WHERE p.pronamespace = v_nsp
            ),
            deps AS (
              SELECT d.classid, d.objid, d.objsubid,
                     CASE d.classid
                       WHEN 'pg_catalog.pg_class'::regclass THEN
                         (SELECT c.relnamespace FROM pg_catalog.pg_class c WHERE c.oid = d.objid)
                       WHEN 'pg_catalog.pg_type'::regclass THEN
                         (SELECT t.typnamespace FROM pg_catalog.pg_type t WHERE t.oid = d.objid)
                       WHEN 'pg_catalog.pg_proc'::regclass THEN
                         (SELECT p.pronamespace FROM pg_catalog.pg_proc p WHERE p.oid = d.objid)
                       WHEN 'pg_catalog.pg_constraint'::regclass THEN
                         (SELECT k.connamespace FROM pg_catalog.pg_constraint k WHERE k.oid = d.objid)
                       WHEN 'pg_catalog.pg_rewrite'::regclass THEN
                         (SELECT c.relnamespace FROM pg_catalog.pg_rewrite r
                            JOIN pg_catalog.pg_class c ON c.oid = r.ev_class WHERE r.oid = d.objid)
                       WHEN 'pg_catalog.pg_attrdef'::regclass THEN
                         (SELECT c.relnamespace FROM pg_catalog.pg_attrdef a
                            JOIN pg_catalog.pg_class c ON c.oid = a.adrelid WHERE a.oid = d.objid)
                       WHEN 'pg_catalog.pg_trigger'::regclass THEN
                         (SELECT c.relnamespace FROM pg_catalog.pg_trigger g
                            JOIN pg_catalog.pg_class c ON c.oid = g.tgrelid WHERE g.oid = d.objid)
                       WHEN 'pg_catalog.pg_policy'::regclass THEN
                         (SELECT c.relnamespace FROM pg_catalog.pg_policy y
                            JOIN pg_catalog.pg_class c ON c.oid = y.polrelid WHERE y.oid = d.objid)
                       ELSE NULL
                     END AS dep_nsp
                FROM pg_catalog.pg_depend d
                JOIN own o ON o.classid = d.refclassid AND o.objid = d.refobjid
               WHERE d.deptype IN ('n', 'a')
            )
            SELECT 1
              FROM deps
             WHERE COALESCE(
                     deps.dep_nsp,
                     pg_catalog.to_regnamespace(
                       (pg_catalog.pg_identify_object(deps.classid, deps.objid, deps.objsubid)).schema
                     )::oid
                   ) IS DISTINCT FROM v_nsp
          ) THEN
            RAISE EXCEPTION 'TENANT_PURGE_EXTERNAL_DEPENDENCY' USING ERRCODE = 'P0001';
          END IF;
        END IF;

        -- 4. Auditoría de inicio, 5. DROP, 6. fila, 7. auditoría de cierre.
        INSERT INTO public.platform_audit_logs
          (user_id, action, entity_type, entity_id, old_value, new_value, request_id)
        VALUES
          (NULL, 'TENANT_PURGE_STARTED', 'Tenant', v_tenant.id::text,
           pg_catalog.jsonb_build_object('status', v_tenant.status, 'schemaName', v_tenant.schema_name),
           pg_catalog.jsonb_build_object('purgedBy', 'worker', 'retentionDays', v_retention, 'actor', v_actor),
           'worker:tenant-schema-purge');

        EXECUTE pg_catalog.format('DROP SCHEMA IF EXISTS %I CASCADE', v_tenant.schema_name);

        DELETE FROM public.tenants WHERE id = v_tenant.id;

        INSERT INTO public.platform_audit_logs
          (user_id, action, entity_type, entity_id, old_value, new_value, request_id)
        VALUES
          (NULL, 'TENANT_PURGE_COMPLETED', 'Tenant', v_tenant.id::text,
           pg_catalog.jsonb_build_object('status', v_tenant.status, 'schemaName', v_tenant.schema_name),
           pg_catalog.jsonb_build_object('purgedBy', 'worker', 'retentionDays', v_retention, 'actor', v_actor),
           'worker:tenant-schema-purge');

        RETURN 'PURGED';
      END;
      $fn$
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.iwana_tenants_deletion_clock()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY INVOKER
      SET search_path = pg_catalog, public, pg_temp
      AS $fn$
      DECLARE
        v_requested timestamptz;
        v_mark boolean := false;
        v_old_status text;
        v_old_deleted timestamptz;
      BEGIN
        -- Sin el rol de mantenimiento (lab de compatibilidad) o para sus miembros, el
        -- comportamiento no cambia. session_user: SET ROLE no lo altera.
        IF pg_catalog.to_regrole('iwana_migrator') IS NULL
           OR pg_catalog.pg_has_role(session_user, 'iwana_migrator', 'MEMBER') THEN
          RETURN NEW;
        END IF;

        IF TG_OP = 'INSERT' THEN
          -- Un alta no puede apuntar a un esquema ajeno que ya existe (el de otro
          -- tenant o un huérfano del migrator). Un esquema propio del llamante (las
          -- suites crean el suyo como iwana_app) no es purgable: la función exige que
          -- su dueño sea el migrator.
          IF EXISTS (
            SELECT 1 FROM pg_catalog.pg_namespace
             WHERE nspname = NEW.schema_name
               AND nspowner IS DISTINCT FROM (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = session_user)
          ) THEN
            RAISE EXCEPTION 'TENANT_SCHEMA_ALREADY_EXISTS' USING ERRCODE = 'P0001';
          END IF;
          v_mark := NEW.deleted_at IS NOT NULL;
        ELSE
          IF NEW.id IS DISTINCT FROM OLD.id OR NEW.schema_name IS DISTINCT FROM OLD.schema_name THEN
            RAISE EXCEPTION 'TENANT_IDENTITY_IMMUTABLE' USING ERRCODE = 'P0001';
          END IF;
          v_old_status := OLD.status;
          v_old_deleted := OLD.deleted_at;

          IF NEW.status = 'MARKED_FOR_DELETION'
             AND OLD.status IS DISTINCT FROM 'MARKED_FOR_DELETION' THEN
            v_mark := true;
          ELSIF NEW.deleted_at IS NOT NULL AND NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
            IF OLD.deleted_at IS NOT NULL
               AND abs(extract(epoch FROM NEW.deleted_at - OLD.deleted_at)) < 1 THEN
              -- Mismo instante con otra precisión (Date de JS en ms): no es una marca.
              NEW.deleted_at := OLD.deleted_at;
            ELSE
              v_mark := true;
            END IF;
          END IF;
        END IF;

        IF NOT v_mark THEN
          RETURN NEW;
        END IF;

        v_requested := NEW.deleted_at;
        NEW.deleted_at := pg_catalog.now();

        INSERT INTO public.platform_audit_logs
          (user_id, action, entity_type, entity_id, old_value, new_value, request_id)
        VALUES
          (NULL,
           CASE
             WHEN v_requested IS NOT NULL
                  AND abs(extract(epoch FROM v_requested - pg_catalog.now())) > 60
               THEN 'TENANT_DELETION_CLOCK_COERCED'
             ELSE 'TENANT_DELETION_CLOCK_SET'
           END,
           'Tenant', NEW.id::text,
           pg_catalog.jsonb_build_object('status', v_old_status, 'deletedAt', v_old_deleted),
           pg_catalog.jsonb_build_object(
             'status', NEW.status,
             'deletedAt', NEW.deleted_at,
             'requestedDeletedAt', v_requested,
             'actor', session_user),
           'db:tenants-deletion-clock');

        RETURN NEW;
      END;
      $fn$
    `);

    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_tenants_deletion_clock ON public.tenants`);
    await queryRunner.query(`
      CREATE TRIGGER trg_tenants_deletion_clock
        BEFORE INSERT OR UPDATE ON public.tenants
        FOR EACH ROW EXECUTE FUNCTION public.iwana_tenants_deletion_clock()
    `);

    await queryRunner.query(`
      REVOKE ALL ON FUNCTION public.iwana_list_purge_candidates(integer, integer) FROM PUBLIC;
      REVOKE ALL ON FUNCTION public.iwana_purge_tenant_schema(uuid, integer) FROM PUBLIC;
    `);
    await queryRunner.query(`
      DO $grant$
      BEGIN
        IF pg_catalog.to_regrole('iwana_purger') IS NOT NULL THEN
          GRANT EXECUTE ON FUNCTION public.iwana_list_purge_candidates(integer, integer) TO iwana_purger;
          GRANT EXECUTE ON FUNCTION public.iwana_purge_tenant_schema(uuid, integer) TO iwana_purger;
        ELSE
          RAISE NOTICE 'R7: el rol iwana_purger no existe; la purga queda sin EXECUTE hasta aplicar apply-least-privilege.';
        END IF;
      END
      $grant$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_tenants_deletion_clock ON public.tenants`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS public.iwana_tenants_deletion_clock()`);
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS public.iwana_purge_tenant_schema(uuid, integer)`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS public.iwana_list_purge_candidates(integer, integer)`,
    );
  }
}
