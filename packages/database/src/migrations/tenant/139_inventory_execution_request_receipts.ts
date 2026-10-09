import { MigrationInterface, QueryRunner } from 'typeorm';

/** Recibo terminal idempotente de solicitudes MOD11 procesadas por MOD12. */
export class InventoryExecutionRequestReceipts1390000000000 implements MigrationInterface {
  name = 'InventoryExecutionRequestReceipts1390000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS inventory_execution_request_receipts (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        inventory_request_id uuid NOT NULL,
        execution_order_id uuid NOT NULL,
        aggregate_version integer NOT NULL CHECK (aggregate_version > 0),
        outcome varchar(16) NOT NULL CHECK (outcome IN ('CONFIRMED', 'REJECTED')),
        stock_movement_id uuid NULL,
        reason_code text NULL,
        decided_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_inventory_execution_request_receipts_tenant_request
          UNIQUE (tenant_id, inventory_request_id),
        CONSTRAINT ck_inventory_execution_request_receipts_outcome
          CHECK (
            (outcome = 'CONFIRMED' AND stock_movement_id IS NOT NULL AND reason_code IS NULL)
            OR
            (outcome = 'REJECTED' AND stock_movement_id IS NULL AND reason_code IS NOT NULL)
          )
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(`
      SELECT COUNT(*)::int AS total
        FROM inventory_execution_request_receipts
    `)) as Array<{ total: number }>;
    const affected = rows[0]?.total ?? 0;
    if (affected > 0) {
      throw new Error(
        `Rollback de InventoryExecutionRequestReceipts bloqueado: ${affected} recibo(s) ` +
          `se perderían; no se borran registros ni se admite bypass.`,
      );
    }

    await queryRunner.query('DROP TABLE IF EXISTS inventory_execution_request_receipts');
  }
}
