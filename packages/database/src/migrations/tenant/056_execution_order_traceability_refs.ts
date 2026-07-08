import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migracion 056: agrega referencias de trazabilidad opcionales sobre la OT.
 *
 * Mantiene desacople entre modulos: solo persiste ids logicos, sin joins cruzados.
 */
export class ExecutionOrderTraceabilityRefs0560000000000 implements MigrationInterface {
  name = 'ExecutionOrderTraceabilityRefs0560000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE execution_orders
        ADD COLUMN IF NOT EXISTS task_id VARCHAR(160),
        ADD COLUMN IF NOT EXISTS ticket_id VARCHAR(160),
        ADD COLUMN IF NOT EXISTS subscriber_id VARCHAR(160)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE execution_orders
        DROP COLUMN IF EXISTS subscriber_id,
        DROP COLUMN IF EXISTS ticket_id,
        DROP COLUMN IF EXISTS task_id
    `);
  }
}
