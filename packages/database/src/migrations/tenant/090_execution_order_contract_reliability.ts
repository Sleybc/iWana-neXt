import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migracion 090: concurrencia, idempotencia, audit-intent y outbox/inbox de MOD11.
 * Todo vive en el schema tenant actual; no hay FK cross-schema.
 */
export class ExecutionOrderContractReliability0900000000000 implements MigrationInterface {
  name = 'ExecutionOrderContractReliability0900000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE execution_orders ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_execution_orders_tenant_schedule_event ON execution_orders (tenant_id, schedule_event_id)`,
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS execution_order_outbox_events (
        id UUID NOT NULL DEFAULT gen_random_uuid(), event_id UUID NOT NULL, tenant_id UUID NOT NULL,
        aggregate_id UUID NOT NULL, aggregate_version INTEGER NOT NULL, event_type VARCHAR(120) NOT NULL,
        payload JSONB NOT NULL, correlation_id UUID NOT NULL, attempt_count INTEGER NOT NULL DEFAULT 0,
        available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), lease_until TIMESTAMPTZ, published_at TIMESTAMPTZ,
        last_error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_execution_order_outbox_events PRIMARY KEY (id)
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_execution_order_outbox_event ON execution_order_outbox_events (tenant_id, event_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_execution_order_outbox_pending ON execution_order_outbox_events (tenant_id, published_at, available_at)`,
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS execution_order_inbox_events (
        id UUID NOT NULL DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, consumer VARCHAR(120) NOT NULL,
        event_id UUID NOT NULL, aggregate_id UUID NOT NULL, aggregate_version INTEGER NOT NULL, processed_at TIMESTAMPTZ,
        last_error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_execution_order_inbox_events PRIMARY KEY (id)
      )
    `);
    await queryRunner.query(
      `ALTER TABLE execution_order_inbox_events ADD COLUMN IF NOT EXISTS aggregate_id UUID`,
    );
    await queryRunner.query(
      `UPDATE execution_order_inbox_events SET aggregate_id = event_id WHERE aggregate_id IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE execution_order_inbox_events ALTER COLUMN aggregate_id SET NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_execution_order_inbox_event_consumer ON execution_order_inbox_events (tenant_id, consumer, event_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_execution_order_inbox_aggregate_version ON execution_order_inbox_events (tenant_id, consumer, aggregate_id, aggregate_version DESC)`,
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS execution_order_idempotency_records (
        id UUID NOT NULL DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, operation VARCHAR(120) NOT NULL,
        key_id VARCHAR(40) NOT NULL, key_hmac CHAR(64) NOT NULL, payload_hmac CHAR(64) NOT NULL,
        intent_id UUID NOT NULL, resource_ref VARCHAR(160), result_code VARCHAR(64), result_status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
        resource_version INTEGER, expires_at TIMESTAMPTZ NOT NULL, tombstoned_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CONSTRAINT pk_execution_order_idempotency_records PRIMARY KEY (id)
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_execution_order_idempotency_key ON execution_order_idempotency_records (tenant_id, operation, key_hmac)`,
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS execution_order_audit_intents (
        id UUID NOT NULL DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, intent_id UUID NOT NULL,
        actor_ref UUID, operation VARCHAR(120) NOT NULL, resource_ref VARCHAR(160) NOT NULL,
        result_code VARCHAR(64) NOT NULL, correlation_id UUID NOT NULL, delivered_at TIMESTAMPTZ,
        attempt_count INTEGER NOT NULL DEFAULT 0, next_attempt_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CONSTRAINT pk_execution_order_audit_intents PRIMARY KEY (id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_execution_order_audit_intent_delivery ON execution_order_audit_intents (tenant_id, delivered_at, next_attempt_at)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_execution_orders_tenant_schedule_event`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_execution_order_audit_intent_delivery`);
    await queryRunner.query(`DROP TABLE IF EXISTS execution_order_audit_intents`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_execution_order_idempotency_key`);
    await queryRunner.query(`DROP TABLE IF EXISTS execution_order_idempotency_records`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_execution_order_inbox_event_consumer`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_execution_order_inbox_aggregate_version`);
    await queryRunner.query(`DROP TABLE IF EXISTS execution_order_inbox_events`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_execution_order_outbox_pending`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_execution_order_outbox_event`);
    await queryRunner.query(`DROP TABLE IF EXISTS execution_order_outbox_events`);
    await queryRunner.query(`ALTER TABLE execution_orders DROP COLUMN IF EXISTS version`);
  }
}
