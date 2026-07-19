import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 015: ownership de audit → `iwana_migrator` (SEC-04).
 *
 * Complementa el SQL operativo de PLAT-OPS (`scripts/db/apply-least-privilege.sql`)
 * para entornos donde las migraciones TypeORM son la fuente de verdad y el init
 * Docker no se re-ejecuta.
 *
 * Si el rol `iwana_migrator` no existe (CI con usuario `test`, lab sin apply),
 * la migración es no-op con NOTICE — no falla el pipeline. Ops debe crear los
 * roles antes de declarar SEC-04 cerrado en staging/prod.
 *
 * No crea roles ni passwords (eso es ops). Solo reasigna ownership y grants
 * mínimos a `iwana_app` cuando ambos roles existen.
 */
export class AuditOwnerLeastPrivilege1700000000015 implements MigrationInterface {
  name = 'AuditOwnerLeastPrivilege1700000000015';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $body$
      DECLARE
        migrator text := 'iwana_migrator';
        app text := 'iwana_app';
        r record;
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = migrator) THEN
          RAISE NOTICE
            '015_audit_owner_least_privilege: rol % ausente — skip (crear roles via apply-least-privilege / init Docker)',
            migrator;
          RETURN;
        END IF;

        IF EXISTS (
          SELECT 1
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public'
            AND p.proname = 'reject_audit_mutation'
        ) THEN
          EXECUTE format(
            'ALTER FUNCTION public.reject_audit_mutation() OWNER TO %I',
            migrator
          );
        END IF;

        IF to_regclass('public.platform_audit_logs') IS NOT NULL THEN
          EXECUTE format(
            'ALTER TABLE public.platform_audit_logs OWNER TO %I',
            migrator
          );
          EXECUTE 'REVOKE ALL ON TABLE public.platform_audit_logs FROM PUBLIC';

          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app) THEN
            EXECUTE format(
              'REVOKE ALL ON TABLE public.platform_audit_logs FROM %I',
              app
            );
            EXECUTE format(
              'GRANT SELECT, INSERT ON TABLE public.platform_audit_logs TO %I',
              app
            );
          END IF;
        END IF;

        FOR r IN
          SELECT n.nspname AS schema_name
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relkind = 'r'
            AND c.relname = 'audit_logs'
            AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        LOOP
          EXECUTE format(
            'ALTER TABLE %I.audit_logs OWNER TO %I',
            r.schema_name,
            migrator
          );
          EXECUTE format(
            'REVOKE ALL ON TABLE %I.audit_logs FROM PUBLIC',
            r.schema_name
          );

          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app) THEN
            EXECUTE format(
              'REVOKE ALL ON TABLE %I.audit_logs FROM %I',
              r.schema_name,
              app
            );
            EXECUTE format(
              'GRANT SELECT, INSERT ON TABLE %I.audit_logs TO %I',
              r.schema_name,
              app
            );
            EXECUTE format(
              'GRANT USAGE ON SCHEMA %I TO %I',
              r.schema_name,
              app
            );
            EXECUTE format(
              'GRANT USAGE ON SCHEMA %I TO %I',
              r.schema_name,
              migrator
            );
          END IF;
        END LOOP;
      END
      $body$
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // No revertir ownership automáticamente: devolver tablas al bootstrap sería
    // peor que el estado post-015. Rollback = intervención ops explícita.
  }
}
