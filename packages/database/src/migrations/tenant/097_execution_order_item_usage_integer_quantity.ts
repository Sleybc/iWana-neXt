import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * R1: las cantidades de consumo de una OT son unidades enteras positivas.
 * La migración falla antes de cambiar el tipo si existen datos incompatibles.
 */
export class ExecutionOrderItemUsageIntegerQuantity0970000000000 implements MigrationInterface {
  name = 'ExecutionOrderItemUsageIntegerQuantity0970000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM execution_order_item_usage
          WHERE quantity <= 0 OR quantity <> trunc(quantity)
        ) THEN
          RAISE EXCEPTION
            'execution_order_item_usage.quantity contains non-positive or fractional values';
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE execution_order_item_usage
        ALTER COLUMN quantity TYPE INTEGER USING quantity::integer,
        ALTER COLUMN quantity SET DEFAULT 1
    `);
    await queryRunner.query(`
      ALTER TABLE execution_order_item_usage
        ADD CONSTRAINT chk_execution_order_item_usage_quantity_positive CHECK (quantity > 0)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE execution_order_item_usage
        DROP CONSTRAINT IF EXISTS chk_execution_order_item_usage_quantity_positive
    `);
    await queryRunner.query(`
      ALTER TABLE execution_order_item_usage
        ALTER COLUMN quantity TYPE NUMERIC(12,2) USING quantity::numeric,
        ALTER COLUMN quantity SET DEFAULT 1
    `);
  }
}
