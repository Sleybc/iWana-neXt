import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 024 (S-6 / SEC-P1): la escotilla `iwana.audit_maintenance = 'on'`
 * deja de depender solo del GUC y exige además pertenencia al rol de
 * mantenimiento `iwana_migrator`. Contraparte pública de la tenant 111.
 *
 * ### El defecto que cierra
 *
 * `public.reject_audit_mutation()` (creada por la 014) cede ante
 * `iwana.audit_maintenance = 'on'`. Un GUC personalizado de dos partes lo puede
 * fijar CUALQUIER rol conectado con `SET LOCAL` — no es restringible por
 * permisos. `iwana_app`, el principal cuyas acciones el trail audita, podía
 * mutar `platform_audit_logs` con la misma llave que la remediación legítima.
 *
 * ### Por qué el GUC solo no basta
 *
 * PostgreSQL no ofrece ACL sobre un GUC custom. La corrección no puede ser
 * «proteger el GUC»; tiene que ser dejar de confiar solo en él. La función
 * exige ahora, además del GUC, pertenencia a `iwana_migrator` vía
 * `pg_has_role(current_user, 'iwana_migrator', 'MEMBER')`. Cuando el rol no
 * existe (CI con usuario `test`, lab sin apply), `to_regrole` devuelve NULL y
 * se preserva el comportamiento anterior.
 *
 * El trigger `trg_platform_audit_logs_immutable` ya apunta a la función: no se
 * toca. El mensaje de excepción deja de explicar cómo evadir el control y exige
 * rol de mantenimiento.
 *
 * Reversible: `down()` restaura el cuerpo de la 014 (escotilla por GUC solo).
 */
export class HardenPlatformAuditMaintenanceGuard1784419212000 implements MigrationInterface {
  name = 'HardenPlatformAuditMaintenanceGuard1784419212000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.reject_audit_mutation()
      RETURNS TRIGGER AS $$
      BEGIN
        IF coalesce(current_setting('iwana.audit_maintenance', true), '') = 'on'
           AND (
             to_regrole('iwana_migrator') IS NULL
             OR pg_has_role(current_user, 'iwana_migrator', 'MEMBER')
           ) THEN
          RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
        END IF;

        RAISE EXCEPTION
          'El registro de auditoria es de solo escritura: % sobre %.% esta prohibido. '
          'La mutacion exige el rol de mantenimiento del audit trail.',
          TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME
          USING ERRCODE = 'insufficient_privilege';
      END;
      $$ LANGUAGE plpgsql
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restaura el cuerpo de la 014: escotilla por GUC solo.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.reject_audit_mutation()
      RETURNS TRIGGER AS $$
      BEGIN
        IF coalesce(current_setting('iwana.audit_maintenance', true), '') = 'on' THEN
          RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
        END IF;

        RAISE EXCEPTION
          'El registro de auditoria es de solo escritura: % sobre %.% esta prohibido. '
          'Para una remediacion deliberada (por ejemplo redactar un secreto filtrado), '
          'ejecutela desde una migracion con SET LOCAL iwana.audit_maintenance = ''on''.',
          TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME
          USING ERRCODE = 'insufficient_privilege';
      END;
      $$ LANGUAGE plpgsql
    `);
  }
}
