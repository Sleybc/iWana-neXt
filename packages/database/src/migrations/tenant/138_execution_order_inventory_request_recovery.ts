import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 138: conserva el rechazo de negocio y el cursor del scanner D7
 * para la conciliación recuperable de consumos de OT.
 */
export class ExecutionOrderInventoryRequestRecovery1380000000000 implements MigrationInterface {
  name = 'ExecutionOrderInventoryRequestRecovery1380000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE execution_order_item_usage
        ADD COLUMN IF NOT EXISTS rejection_reason_code text NULL,
        ADD COLUMN IF NOT EXISTS last_requested_at timestamptz NULL,
        ADD COLUMN IF NOT EXISTS request_attempts integer NOT NULL DEFAULT 1
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE execution_order_item_usage
        DROP COLUMN IF EXISTS request_attempts,
        DROP COLUMN IF EXISTS last_requested_at,
        DROP COLUMN IF EXISTS rejection_reason_code
    `);
  }
}
