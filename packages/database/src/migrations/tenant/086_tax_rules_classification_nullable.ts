import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 086 — MOD06 deuda alertas: `tax_rules.tax_classification_id` nullable.
 *
 * Tras migración 025 se eliminó `tax_classifications` pero la columna quedó NOT NULL.
 * El alta de reglas vía API/UI (design 2026-07-23) no puede exigir un UUID legacy.
 *
 * Down: solo restaura NOT NULL si no hay filas con NULL; si hay, aborta con mensaje claro.
 */
export class TaxRulesClassificationNullable0860000000000 implements MigrationInterface {
  name = 'TaxRulesClassificationNullable0860000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE tax_rules
        ALTER COLUMN tax_classification_id DROP NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query(`
      SELECT COUNT(*)::int AS count
      FROM tax_rules
      WHERE tax_classification_id IS NULL
    `);
    const nullCount = Number((rows as Array<{ count: number }>)[0]?.count ?? 0);
    if (nullCount > 0) {
      throw new Error(
        `No se puede restaurar NOT NULL en tax_rules.tax_classification_id: hay ${nullCount} fila(s) con NULL. Asigna un UUID o elimina esas filas antes del down.`,
      );
    }

    await queryRunner.query(`
      ALTER TABLE tax_rules
        ALTER COLUMN tax_classification_id SET NOT NULL
    `);
  }
}
