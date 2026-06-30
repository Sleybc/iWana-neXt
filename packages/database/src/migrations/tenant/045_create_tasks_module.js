'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.CreateTasksModule0450000000000 = void 0;
/**
 * Migracion 045: crea el esquema del Modulo Ejecucion Operativa / Tareas (MOD11) Fase 01.
 * - Tipos ENUM para tipo, estado, prioridad, origen, destinatario, responsable y modo de ejecucion.
 * - Tabla operational_tasks con responsable activo y destinatario explicito.
 * - Tabla task_timeline_events (append-only).
 * - Tabla task_assignment_history (handoff).
 *
 * Schema: tenant (search_path resuelto por TenantContext — sin prefijo explicito)
 * Reversible: si — down() elimina tablas, indices y tipos ENUM en orden inverso.
 *
 * Referencias: ADR-046, HLD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0, PRD-MOD11
 */
class CreateTasksModule0450000000000 {
  name = 'CreateTasksModule0450000000000';
  async up(queryRunner) {
    await queryRunner.query(`
      CREATE TYPE task_type AS ENUM (
        'CUSTOMER_SUPPORT', 'INTERNAL_OPERATION', 'INSTALLATION', 'FIELD_VISIT',
        'BACKOFFICE', 'COLLECTION', 'REVIEW'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE task_status AS ENUM (
        'OPEN', 'READY', 'SCHEDULED', 'IN_PROGRESS', 'PENDING_EXTERNAL',
        'PENDING_INTERNAL', 'BLOCKED', 'RESOLVED', 'CANCELLED'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE task_priority AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT')
    `);
    await queryRunner.query(`
      CREATE TYPE task_origin_context AS ENUM (
        'ASSURANCE', 'CRM', 'WFM', 'BILLING', 'MANUAL', 'SYSTEM'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE task_recipient_type AS ENUM (
        'SUBSCRIBER', 'PROSPECT', 'INTERNAL_USER', 'INTERNAL_AREA',
        'CONTRACTOR', 'EXTERNAL_PARTY'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE task_responsible_type AS ENUM ('USER', 'TEAM', 'QUEUE')
    `);
    await queryRunner.query(`
      CREATE TYPE task_execution_mode AS ENUM (
        'IMMEDIATE', 'DUE_DATE', 'SCHEDULED', 'FIELD_SERVICE'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE task_timeline_event_type AS ENUM (
        'CREATED', 'ASSIGNED', 'REASSIGNED', 'STATUS_CHANGED', 'SCHEDULE_LINKED',
        'WORK_ORDER_LINKED', 'BLOCKED', 'RESOLVED', 'CANCELLED'
      )
    `);
    await queryRunner.query(`
      CREATE TABLE operational_tasks (
        id                    UUID                NOT NULL DEFAULT gen_random_uuid(),
        tenant_id             UUID                NOT NULL,
        task_number           VARCHAR(30)         NOT NULL,
        type                  task_type           NOT NULL,
        status                task_status         NOT NULL DEFAULT 'OPEN',
        priority              task_priority       NOT NULL DEFAULT 'NORMAL',
        title                 VARCHAR(200)        NOT NULL,
        description           TEXT,
        origin_context        task_origin_context NOT NULL,
        origin_ref_id         VARCHAR(160),
        ticket_id             VARCHAR(160),
        responsible_type      task_responsible_type NOT NULL,
        responsible_ref_id    VARCHAR(160)        NOT NULL,
        recipient_type        task_recipient_type NOT NULL,
        recipient_ref_id      VARCHAR(160),
        recipient_label       VARCHAR(160),
        queue_name            VARCHAR(80),
        execution_mode        task_execution_mode NOT NULL,
        due_at                TIMESTAMPTZ,
        scheduled_required    BOOLEAN             NOT NULL DEFAULT FALSE,
        schedule_event_id     VARCHAR(160),
        work_order_id         VARCHAR(160),
        created_by_user_id    UUID,
        resolved_at           TIMESTAMPTZ,
        closed_at             TIMESTAMPTZ,
        created_at            TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_operational_tasks PRIMARY KEY (id)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_operational_tasks_tenant_number
        ON operational_tasks (tenant_id, task_number)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_operational_tasks_tenant_status
        ON operational_tasks (tenant_id, status)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_operational_tasks_tenant_responsible
        ON operational_tasks (tenant_id, responsible_ref_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_operational_tasks_tenant_recipient
        ON operational_tasks (tenant_id, recipient_ref_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_operational_tasks_tenant_origin
        ON operational_tasks (tenant_id, origin_context, origin_ref_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_operational_tasks_tenant_due_at
        ON operational_tasks (tenant_id, due_at)
    `);
    await queryRunner.query(`
      CREATE TABLE task_timeline_events (
        id              UUID                      NOT NULL DEFAULT gen_random_uuid(),
        task_id         UUID                      NOT NULL,
        tenant_id       UUID                      NOT NULL,
        event_type      task_timeline_event_type  NOT NULL,
        payload         JSONB                     NOT NULL DEFAULT '{}',
        actor_user_id   UUID,
        occurred_at     TIMESTAMPTZ               NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_task_timeline_events PRIMARY KEY (id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_task_timeline_task ON task_timeline_events (task_id, occurred_at)
    `);
    await queryRunner.query(`
      CREATE TABLE task_assignment_history (
        id                            UUID                  NOT NULL DEFAULT gen_random_uuid(),
        tenant_id                     UUID                  NOT NULL,
        task_id                       UUID                  NOT NULL,
        previous_responsible_type     task_responsible_type NOT NULL,
        previous_responsible_ref_id   VARCHAR(160)          NOT NULL,
        new_responsible_type          task_responsible_type NOT NULL,
        new_responsible_ref_id        VARCHAR(160)          NOT NULL,
        reason                        VARCHAR(500),
        actor_user_id                 UUID,
        created_at                    TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_task_assignment_history PRIMARY KEY (id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_task_assignment_history_task
        ON task_assignment_history (task_id, created_at)
    `);
  }
  async down(queryRunner) {
    await queryRunner.query(`DROP TABLE IF EXISTS task_assignment_history`);
    await queryRunner.query(`DROP TABLE IF EXISTS task_timeline_events`);
    await queryRunner.query(`DROP TABLE IF EXISTS operational_tasks`);
    await queryRunner.query(`DROP TYPE IF EXISTS task_timeline_event_type`);
    await queryRunner.query(`DROP TYPE IF EXISTS task_execution_mode`);
    await queryRunner.query(`DROP TYPE IF EXISTS task_responsible_type`);
    await queryRunner.query(`DROP TYPE IF EXISTS task_recipient_type`);
    await queryRunner.query(`DROP TYPE IF EXISTS task_origin_context`);
    await queryRunner.query(`DROP TYPE IF EXISTS task_priority`);
    await queryRunner.query(`DROP TYPE IF EXISTS task_status`);
    await queryRunner.query(`DROP TYPE IF EXISTS task_type`);
  }
}
exports.CreateTasksModule0450000000000 = CreateTasksModule0450000000000;
//# sourceMappingURL=045_create_tasks_module.js.map
