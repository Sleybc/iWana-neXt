'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.CreateExecutionOrdersModule0460000000000 = void 0;
/**
 * Migracion 046: agrega OT de ejecucion enriquecida para MOD11 y refs logicas en WFM.
 * Mantiene separation of concerns: agenda en MOD09, ejecucion en MOD11.
 */
class CreateExecutionOrdersModule0460000000000 {
  name = 'CreateExecutionOrdersModule0460000000000';
  async up(queryRunner) {
    await queryRunner.query(`
      CREATE TYPE execution_order_status AS ENUM (
        'CREATED', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS', 'BLOCKED',
        'COMPLETED', 'COMPLETED_WITH_OBSERVATIONS', 'NOT_EXECUTED', 'CANCELLED'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE execution_order_result AS ENUM (
        'EXECUTED', 'EXECUTED_WITH_OBSERVATIONS', 'NOT_EXECUTED',
        'REQUIRES_FOLLOW_UP', 'CANCELLED'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE execution_order_item_action AS ENUM (
        'INSTALL', 'CONSUME', 'RETURN', 'REMOVE'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE inventory_disposition AS ENUM (
        'INSTALLED_AT_CUSTOMER',
        'INTERNAL_CONSUMPTION',
        'RETURNED_TO_TECHNICIAN_STOCK',
        'RETURNED_TO_WAREHOUSE',
        'DAMAGED_OR_LOST'
      )
    `);
    await queryRunner.query(`
      CREATE TABLE execution_orders (
        id                       UUID                    NOT NULL DEFAULT gen_random_uuid(),
        tenant_id                UUID                    NOT NULL,
        execution_order_number   VARCHAR(40)             NOT NULL,
        visit_request_id         UUID,
        schedule_event_id        UUID                    NOT NULL,
        assigned_technician_id   UUID,
        assigned_crew_id         UUID,
        origin_context           VARCHAR(64)             NOT NULL,
        origin_ref_id            VARCHAR(160),
        customer_display_label   VARCHAR(200)            NOT NULL,
        service_address          VARCHAR(255),
        municipality             VARCHAR(120),
        sector                   VARCHAR(120),
        work_type                wfm_work_type           NOT NULL,
        work_summary             VARCHAR(200)            NOT NULL,
        work_instructions        TEXT,
        planned_window_start_at  TIMESTAMPTZ             NOT NULL,
        planned_window_end_at    TIMESTAMPTZ             NOT NULL,
        status                   execution_order_status  NOT NULL DEFAULT 'CREATED',
        result                   execution_order_result,
        started_at               TIMESTAMPTZ,
        closed_at                TIMESTAMPTZ,
        close_notes              TEXT,
        created_by_user_id       UUID,
        updated_by_user_id       UUID,
        created_at               TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
        updated_at               TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_execution_orders PRIMARY KEY (id)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_execution_orders_tenant_number
        ON execution_orders (tenant_id, execution_order_number)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_execution_orders_tenant_status
        ON execution_orders (tenant_id, status)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_execution_orders_tenant_schedule_event
        ON execution_orders (tenant_id, schedule_event_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_execution_orders_tenant_assigned_technician
        ON execution_orders (tenant_id, assigned_technician_id)
    `);
    await queryRunner.query(`
      CREATE TABLE execution_order_activities (
        id                 UUID         NOT NULL DEFAULT gen_random_uuid(),
        execution_order_id UUID         NOT NULL,
        tenant_id          UUID         NOT NULL,
        activity_type      VARCHAR(64)  NOT NULL,
        description        TEXT         NOT NULL,
        actor_user_id      UUID,
        created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_execution_order_activities PRIMARY KEY (id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_execution_order_activities_order
        ON execution_order_activities (execution_order_id, created_at)
    `);
    await queryRunner.query(`
      CREATE TABLE execution_order_item_usage (
        id                    UUID                        NOT NULL DEFAULT gen_random_uuid(),
        execution_order_id    UUID                        NOT NULL,
        tenant_id             UUID                        NOT NULL,
        item_id               VARCHAR(160)                NOT NULL,
        technician_custody_id VARCHAR(160)                NOT NULL,
        quantity              NUMERIC(12,2)               NOT NULL DEFAULT 1,
        serial_number         VARCHAR(160),
        action                execution_order_item_action NOT NULL,
        final_disposition     inventory_disposition       NOT NULL,
        stock_movement_id     VARCHAR(160),
        actor_user_id         UUID,
        created_at            TIMESTAMPTZ                 NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_execution_order_item_usage PRIMARY KEY (id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_execution_order_item_usage_order
        ON execution_order_item_usage (execution_order_id, created_at)
    `);
    await queryRunner.query(`
      CREATE TABLE execution_order_evidence (
        id                 UUID         NOT NULL DEFAULT gen_random_uuid(),
        execution_order_id UUID         NOT NULL,
        tenant_id          UUID         NOT NULL,
        evidence_type      VARCHAR(64)  NOT NULL,
        file_name          VARCHAR(200),
        notes              TEXT,
        actor_user_id      UUID,
        created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_execution_order_evidence PRIMARY KEY (id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_execution_order_evidence_order
        ON execution_order_evidence (execution_order_id, created_at)
    `);
    await queryRunner.query(`
      ALTER TABLE schedule_events ADD COLUMN execution_order_id UUID
    `);
    await queryRunner.query(`
      ALTER TABLE visit_requests ADD COLUMN execution_order_id UUID
    `);
  }
  async down(queryRunner) {
    await queryRunner.query(`ALTER TABLE visit_requests DROP COLUMN IF EXISTS execution_order_id`);
    await queryRunner.query(`ALTER TABLE schedule_events DROP COLUMN IF EXISTS execution_order_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS execution_order_evidence`);
    await queryRunner.query(`DROP TABLE IF EXISTS execution_order_item_usage`);
    await queryRunner.query(`DROP TABLE IF EXISTS execution_order_activities`);
    await queryRunner.query(`DROP TABLE IF EXISTS execution_orders`);
    await queryRunner.query(`DROP TYPE IF EXISTS inventory_disposition`);
    await queryRunner.query(`DROP TYPE IF EXISTS execution_order_item_action`);
    await queryRunner.query(`DROP TYPE IF EXISTS execution_order_result`);
    await queryRunner.query(`DROP TYPE IF EXISTS execution_order_status`);
  }
}
exports.CreateExecutionOrdersModule0460000000000 = CreateExecutionOrdersModule0460000000000;
//# sourceMappingURL=046_create_execution_orders_module.js.map
