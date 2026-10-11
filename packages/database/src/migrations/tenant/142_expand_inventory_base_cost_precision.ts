import { MigrationInterface, QueryRunner } from 'typeorm';

/** Precisión de costo base para UOM métricas (p. ej. costo por metro). */
export class ExpandInventoryBaseCostPrecision1420000000000 implements MigrationInterface {
  name = 'ExpandInventoryBaseCostPrecision1420000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE inventory_items
        ALTER COLUMN base_cost TYPE numeric(14,5) USING base_cost::numeric(14,5),
        ALTER COLUMN standard_cost TYPE numeric(14,5) USING standard_cost::numeric(14,5),
        ALTER COLUMN last_purchase_cost TYPE numeric(14,5)
          USING last_purchase_cost::numeric(14,5),
        ALTER COLUMN average_cost TYPE numeric(14,5) USING average_cost::numeric(14,5)
    `);

    await queryRunner.query(`
      ALTER TABLE stock_movement_lines
        ALTER COLUMN unit_cost TYPE numeric(14,5) USING unit_cost::numeric(14,5)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(`
      SELECT COUNT(*)::int AS total
        FROM (
          SELECT base_cost AS cost FROM inventory_items
          UNION ALL SELECT standard_cost FROM inventory_items
          UNION ALL SELECT last_purchase_cost FROM inventory_items WHERE last_purchase_cost IS NOT NULL
          UNION ALL SELECT average_cost FROM inventory_items
          UNION ALL SELECT unit_cost FROM stock_movement_lines WHERE unit_cost IS NOT NULL
        ) AS costs
       WHERE cost <> ROUND(cost, 2)
    `)) as Array<{ total: number }>;
    const preciseCosts = rows[0]?.total ?? 0;
    if (preciseCosts > 0) {
      throw new Error(
        `Rollback de ExpandInventoryBaseCostPrecision bloqueado: ${preciseCosts} costo(s) ` +
          `tienen más de dos decimales; revierta primero las conversiones que los requieren.`,
      );
    }

    await queryRunner.query(`
      ALTER TABLE stock_movement_lines
        ALTER COLUMN unit_cost TYPE numeric(14,2) USING unit_cost::numeric(14,2)
    `);
    await queryRunner.query(`
      ALTER TABLE inventory_items
        ALTER COLUMN base_cost TYPE numeric(14,2) USING base_cost::numeric(14,2),
        ALTER COLUMN standard_cost TYPE numeric(14,2) USING standard_cost::numeric(14,2),
        ALTER COLUMN last_purchase_cost TYPE numeric(14,2)
          USING last_purchase_cost::numeric(14,2),
        ALTER COLUMN average_cost TYPE numeric(14,2) USING average_cost::numeric(14,2)
    `);
  }
}
