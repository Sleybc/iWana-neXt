import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 080: costo promedio móvil por ítem (MOD12 Existencias Fase 04 / ADR-059).
 *
 * - Columna `average_cost NUMERIC(14,2) NOT NULL DEFAULT 0`
 * - Backfill: COALESCE(last_purchase_cost, standard_cost, base_cost, 0)
 * - Reversible: DROP COLUMN
 */
export class AddInventoryItemAverageCost0800000000000 implements MigrationInterface {
  name = 'AddInventoryItemAverageCost0800000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE inventory_items
        ADD COLUMN IF NOT EXISTS average_cost NUMERIC(14,2) NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      UPDATE inventory_items
      SET average_cost = COALESCE(last_purchase_cost, standard_cost, base_cost, 0)
      WHERE average_cost = 0
        AND COALESCE(last_purchase_cost, standard_cost, base_cost, 0) <> 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE inventory_items
        DROP COLUMN IF EXISTS average_cost
    `);
  }
}
