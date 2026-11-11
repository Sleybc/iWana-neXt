import { MigrationInterface, QueryRunner } from 'typeorm';

const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

/**
 * Migración 193 — tipo de línea `INSTALACION` (MOD05 cierre de venta fase 2, bloque D; CA-4/CA-5).
 *
 * Amplía el CHECK de `billing_document_lines.kind` (173) para la línea «Instalación» del primer
 * cobro. `down()` restaura el CHECK original; si hay líneas `INSTALACION` lo bloquea salvo
 * `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true`, y entonces las borra: no caben en el CHECK de 173.
 */
export class BillingLineKindInstallation1930000000193 implements MigrationInterface {
  name = 'BillingLineKindInstallation1930000000193';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE billing_document_lines
        DROP CONSTRAINT IF EXISTS billing_document_lines_kind_check,
        ADD CONSTRAINT billing_document_lines_kind_check
          CHECK (kind IN ('PLAN','ADICIONAL','PRORRATEO','INSTALACION'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT COUNT(*)::int AS count FROM billing_document_lines WHERE kind = 'INSTALACION'`,
    )) as Array<{ count: number }>;
    if ((rows[0]?.count ?? 0) > 0) {
      if (process.env[DESTRUCTIVE_DOWN_ENV_VAR] !== 'true') {
        throw new Error(
          `Migración 193: hay líneas de instalación; define ${DESTRUCTIVE_DOWN_ENV_VAR}=true para revertir.`,
        );
      }
      await queryRunner.query(`DELETE FROM billing_document_lines WHERE kind = 'INSTALACION'`);
    }
    await queryRunner.query(`
      ALTER TABLE billing_document_lines
        DROP CONSTRAINT IF EXISTS billing_document_lines_kind_check,
        ADD CONSTRAINT billing_document_lines_kind_check
          CHECK (kind IN ('PLAN','ADICIONAL','PRORRATEO'))
    `);
  }
}
