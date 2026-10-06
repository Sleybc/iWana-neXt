import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 137: conserva la procedencia del requisito MATERIAL en nuevos
 * consumos de OT. Las filas existentes permanecen NULL: su requisito de origen
 * no puede reconstruirse con autoridad a partir de la categoría.
 */
export class ExecutionOrderItemUsageRequirementKey1370000000000 implements MigrationInterface {
  name = 'ExecutionOrderItemUsageRequirementKey1370000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE execution_order_item_usage
        ADD COLUMN IF NOT EXISTS requirement_key varchar(128) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(`
      SELECT COUNT(*)::int AS total
        FROM execution_order_item_usage
       WHERE requirement_key IS NOT NULL
    `)) as Array<{ total: number }>;
    const affected = rows[0]?.total ?? 0;
    if (affected > 0) {
      throw new Error(
        `Rollback de ExecutionOrderItemUsageRequirementKey bloqueado: ${affected} consumo(s) ` +
          `tienen una clave de requisito que se perdería; no se borran registros ni se admite bypass.`,
      );
    }

    await queryRunner.query(`
      ALTER TABLE execution_order_item_usage
        DROP COLUMN IF EXISTS requirement_key
    `);
  }
}
