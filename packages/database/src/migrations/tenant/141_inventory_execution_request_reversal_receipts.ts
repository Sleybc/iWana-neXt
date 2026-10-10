import { MigrationInterface, QueryRunner } from 'typeorm';

/** Recibos por tipo de solicitud y origen para el ledger de reverso MOD12. */
export class InventoryExecutionRequestReversalReceipts1410000000000 implements MigrationInterface {
  name = 'InventoryExecutionRequestReversalReceipts1410000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE inventory_execution_request_receipts
        ADD COLUMN kind varchar(16) NOT NULL DEFAULT 'CONSUMPTION',
        ADD COLUMN original_stock_movement_id uuid NULL
    `);

    await queryRunner.query(`
      ALTER TABLE inventory_execution_request_receipts
        RENAME COLUMN inventory_request_id TO request_id
    `);

    await queryRunner.query(`
      ALTER TABLE inventory_execution_request_receipts
        DROP CONSTRAINT uq_inventory_execution_request_receipts_tenant_request,
        ADD CONSTRAINT ck_inventory_execution_request_receipts_kind
          CHECK (kind IN ('CONSUMPTION', 'REVERSAL')),
        ADD CONSTRAINT uq_inventory_execution_request_receipts_tenant_kind_request
          UNIQUE (tenant_id, kind, request_id)
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
            FROM pg_enum e
            JOIN pg_type t ON t.oid = e.enumtypid
           WHERE t.typname = 'stock_movement_origin'
             AND t.typnamespace = current_schema()::regnamespace
             AND e.enumlabel = 'EXECUTION_ORDER_REVERSAL'
        ) THEN
          ALTER TYPE stock_movement_origin ADD VALUE 'EXECUTION_ORDER_REVERSAL';
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const reversalReceipts = (await queryRunner.query(`
      SELECT COUNT(*)::int AS total
        FROM inventory_execution_request_receipts
       WHERE kind = 'REVERSAL'
    `)) as Array<{ total: number }>;
    const receiptCount = reversalReceipts[0]?.total ?? 0;
    if (receiptCount > 0) {
      throw new Error(
        `Rollback de InventoryExecutionRequestReversalReceipts bloqueado: ${receiptCount} ` +
          `recibo(s) REVERSAL conservan el resultado; no se borran registros ni se admite bypass.`,
      );
    }

    const reversalMovements = (await queryRunner.query(`
      SELECT COUNT(*)::int AS total
        FROM stock_movements
       WHERE origin = 'EXECUTION_ORDER_REVERSAL'
    `)) as Array<{ total: number }>;
    const movementCount = reversalMovements[0]?.total ?? 0;
    if (movementCount > 0) {
      throw new Error(
        `Rollback de InventoryExecutionRequestReversalReceipts bloqueado: ${movementCount} ` +
          `movimiento(s) de reverso conservan el ledger; no se admite bypass.`,
      );
    }

    await queryRunner.query(`
      ALTER TABLE inventory_execution_request_receipts
        DROP CONSTRAINT uq_inventory_execution_request_receipts_tenant_kind_request,
        DROP CONSTRAINT ck_inventory_execution_request_receipts_kind,
        DROP COLUMN original_stock_movement_id,
        DROP COLUMN kind
    `);

    await queryRunner.query(`
      ALTER TABLE inventory_execution_request_receipts
        RENAME COLUMN request_id TO inventory_request_id
    `);

    await queryRunner.query(`
      ALTER TABLE inventory_execution_request_receipts
        ADD CONSTRAINT uq_inventory_execution_request_receipts_tenant_request
          UNIQUE (tenant_id, inventory_request_id)
    `);

    // PostgreSQL no permite retirar de forma portable un label de enum ya publicado.
  }
}
