import { MigrationInterface, QueryRunner } from 'typeorm';

/** Reversos de consumo MOD11 (R3, R9 y R10); se ejecuta en cada schema tenant. */
export class ExecutionOrderItemUsageReversals1400000000000 implements MigrationInterface {
  name = 'ExecutionOrderItemUsageReversals1400000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE execution_order_item_usage_reversals (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        execution_order_id uuid NOT NULL,
        item_usage_id uuid NOT NULL,
        reversal_request_id uuid NOT NULL,
        reason text NOT NULL,
        requested_by uuid NOT NULL,
        requested_at timestamptz NOT NULL DEFAULT NOW(),
        status varchar(16) NOT NULL DEFAULT 'PENDING',
        stock_movement_id varchar(160) NULL,
        rejection_reason_code varchar(64) NULL,
        decided_at timestamptz NULL,
        last_requested_at timestamptz NOT NULL DEFAULT NOW(),
        request_attempts integer NOT NULL DEFAULT 1,
        CONSTRAINT chk_execution_order_item_usage_reversals_status
          CHECK (status IN ('PENDING', 'CONFIRMED', 'REJECTED')),
        CONSTRAINT chk_execution_order_item_usage_reversals_attempts
          CHECK (request_attempts >= 1),
        CONSTRAINT uq_execution_order_item_usage_reversals_tenant_request
          UNIQUE (tenant_id, reversal_request_id)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_execution_order_item_usage_reversals_active_usage
        ON execution_order_item_usage_reversals (item_usage_id)
       WHERE status IN ('PENDING', 'CONFIRMED')
    `);
    await queryRunner.query(`
      CREATE INDEX idx_execution_order_item_usage_reversals_order
        ON execution_order_item_usage_reversals (tenant_id, execution_order_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_execution_order_item_usage_reversals_retry
        ON execution_order_item_usage_reversals (tenant_id, last_requested_at, id)
       WHERE status = 'PENDING'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(`
      SELECT COUNT(*)::int AS total
        FROM execution_order_item_usage_reversals
    `)) as Array<{ total: number }>;
    const affected = rows[0]?.total ?? 0;
    if (affected > 0) {
      throw new Error(
        `Rollback de ExecutionOrderItemUsageReversals bloqueado: ${affected} reverso(s) ` +
          `conservan auditoría y resultado; no se borran registros ni se admite bypass.`,
      );
    }

    await queryRunner.query(`DROP TABLE execution_order_item_usage_reversals`);
  }
}
