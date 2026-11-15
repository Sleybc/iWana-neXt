import { MigrationInterface, QueryRunner } from 'typeorm';

const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

/**
 * Migración 210 — equivalencia de tipo `TITULAR` (spec 2026-11-15 «complementar titular», §3;
 * ADR-110 D11): el operador enlaza un cliente de UISP con un suscriptor existente de iWana.
 *
 * Solo amplía `chk_migration_mappings_kind`. `chk_migration_mappings_action_kind` no cambia:
 * `TITULAR` solo admite `EQUIVALE` con destino (`DESCARTAR`/`NOTA` siguen siendo de `ETIQUETA`).
 *
 * `down()` restaura el CHECK de la 194. Si hay equivalencias `TITULAR` lo bloquea salvo
 * `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true`, que las borra antes: no hay tipo al que llevarlas.
 */
export class MigrationMappingKindTitular2100000000210 implements MigrationInterface {
  name = 'MigrationMappingKindTitular2100000000210';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE migration_mappings
        DROP CONSTRAINT IF EXISTS chk_migration_mappings_kind,
        ADD CONSTRAINT chk_migration_mappings_kind
          CHECK (kind IN ('PLAN','METODO_PAGO','CICLO','ETIQUETA','TITULAR'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (process.env[DESTRUCTIVE_DOWN_ENV_VAR] !== 'true') {
      const [row] = (await queryRunner.query(
        `SELECT COUNT(*)::int AS n FROM migration_mappings WHERE kind = 'TITULAR'`,
      )) as Array<{ n: number }>;
      if ((row?.n ?? 0) > 0) {
        throw new Error(
          `Migración 210 down bloqueada: hay ${row?.n} equivalencias TITULAR. Para una reversión ` +
            `destructiva, exporte ${DESTRUCTIVE_DOWN_ENV_VAR}=true.`,
        );
      }
    }
    await queryRunner.query(`DELETE FROM migration_mappings WHERE kind = 'TITULAR'`);
    await queryRunner.query(`
      ALTER TABLE migration_mappings
        DROP CONSTRAINT IF EXISTS chk_migration_mappings_kind,
        ADD CONSTRAINT chk_migration_mappings_kind
          CHECK (kind IN ('PLAN','METODO_PAGO','CICLO','ETIQUETA'))
    `);
  }
}
