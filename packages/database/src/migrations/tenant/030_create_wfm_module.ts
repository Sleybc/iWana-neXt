import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 030: crea el esquema del Módulo WFM / Programación (MOD09) Fase 1.
 * - Tipos ENUM para trabajo, estado de agenda, estado de OT, prioridad, origen y disponibilidad.
 * - Tabla schedule_events: agenda operativa con vinculos cross-module por ID logico.
 * - Tabla work_orders: orden operativa ligera con code unico por tenant.
 * - Tabla work_order_tasks: tareas internas de una Work Order.
 * - Tabla schedule_reschedule_logs: historial append-only de reagendamientos.
 * - Tabla technician_availability: bloqueos y disponibilidad puntual por tecnico.
 * - Indices exigidos por el spec para consultas de agenda por rango, tecnico y vinculo.
 *
 * Schema: tenant (search_path resuelto por TenantContext — sin prefijo explicito)
 * Reversible: si — down() elimina tablas, indices y tipos ENUM en orden inverso.
 *
 * Referencias: ADR-037, HLD-MOD09-PROGRAMACION-WFM-v1.0 §4, SPEC-MOD09 §6
 */
export class CreateWfmModule1700000000030 implements MigrationInterface {
  name = 'CreateWfmModule1700000000030';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Tipos ENUM ────────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TYPE wfm_work_type AS ENUM (
        'INSTALLATION', 'SUPPORT', 'TECHNICAL_VISIT', 'RETIREMENT', 'MAINTENANCE'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE schedule_event_status AS ENUM (
        'DRAFT', 'SCHEDULED', 'EN_ROUTE', 'IN_PROGRESS',
        'COMPLETED', 'CANCELLED', 'RESCHEDULED', 'NO_SHOW'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE work_order_status AS ENUM (
        'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'DONE', 'CANCELLED'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE work_order_task_status AS ENUM (
        'PENDING', 'IN_PROGRESS', 'DONE', 'CANCELLED'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE work_order_priority AS ENUM (
        'LOW', 'NORMAL', 'HIGH', 'URGENT'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE work_order_source_context AS ENUM (
        'CRM', 'ASSURANCE', 'PROVISIONING', 'MANUAL'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE technician_availability_type AS ENUM (
        'AVAILABLE', 'BLOCKED', 'TIME_OFF'
      )
    `);

    // ── schedule_events ───────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE schedule_events (
        id                  UUID          NOT NULL DEFAULT gen_random_uuid(),
        tenant_id           UUID          NOT NULL,
        work_order_id       UUID,
        type                wfm_work_type NOT NULL,
        status              schedule_event_status NOT NULL DEFAULT 'DRAFT',
        title               VARCHAR(160)  NOT NULL,
        description         TEXT,
        scheduled_start_at  TIMESTAMPTZ   NOT NULL,
        scheduled_end_at    TIMESTAMPTZ   NOT NULL,
        assigned_user_id    UUID          NOT NULL,
        assigned_team_id    UUID,
        address             VARCHAR(255),
        municipality        VARCHAR(120),
        latitude            NUMERIC(10, 7),
        longitude           NUMERIC(10, 7),
        expediente_id       UUID,
        subscriber_id       UUID,
        ticket_id           VARCHAR(160),
        contract_id         UUID,
        created_by          UUID          NOT NULL,
        updated_by          UUID,
        created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
        updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
        deleted_at          TIMESTAMPTZ,
        CONSTRAINT pk_schedule_events PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_schedule_events_tenant_start
        ON schedule_events (tenant_id, scheduled_start_at)
        WHERE deleted_at IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX idx_schedule_events_tenant_assigned_start
        ON schedule_events (tenant_id, assigned_user_id, scheduled_start_at)
        WHERE deleted_at IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX idx_schedule_events_tenant_status_start
        ON schedule_events (tenant_id, status, scheduled_start_at)
        WHERE deleted_at IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX idx_schedule_events_tenant_expediente
        ON schedule_events (tenant_id, expediente_id)
        WHERE expediente_id IS NOT NULL AND deleted_at IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX idx_schedule_events_tenant_ticket
        ON schedule_events (tenant_id, ticket_id)
        WHERE ticket_id IS NOT NULL AND deleted_at IS NULL
    `);

    // ── work_orders ───────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE work_orders (
        id                  UUID                      NOT NULL DEFAULT gen_random_uuid(),
        tenant_id           UUID                      NOT NULL,
        code                VARCHAR(40)               NOT NULL,
        type                wfm_work_type             NOT NULL,
        status              work_order_status         NOT NULL DEFAULT 'OPEN',
        priority            work_order_priority       NOT NULL DEFAULT 'NORMAL',
        assigned_user_id    UUID                      NOT NULL,
        scheduled_event_id  UUID,
        source_context      work_order_source_context NOT NULL,
        source_ref          VARCHAR(160),
        summary             VARCHAR(200)              NOT NULL,
        notes               TEXT,
        created_by          UUID                      NOT NULL,
        closed_by           UUID,
        closed_at           TIMESTAMPTZ,
        created_at          TIMESTAMPTZ               NOT NULL DEFAULT now(),
        updated_at          TIMESTAMPTZ               NOT NULL DEFAULT now(),
        deleted_at          TIMESTAMPTZ,
        CONSTRAINT pk_work_orders PRIMARY KEY (id)
      )
    `);

    /* code unico por tenant (excluyendo borrados logicos) */
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_work_orders_tenant_code
        ON work_orders (tenant_id, code)
        WHERE deleted_at IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX idx_work_orders_tenant_status
        ON work_orders (tenant_id, status)
        WHERE deleted_at IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX idx_work_orders_tenant_assigned
        ON work_orders (tenant_id, assigned_user_id)
        WHERE deleted_at IS NULL
    `);

    // ── work_order_tasks ──────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE work_order_tasks (
        id              UUID                    NOT NULL DEFAULT gen_random_uuid(),
        tenant_id       UUID                    NOT NULL,
        work_order_id   UUID                    NOT NULL,
        title           VARCHAR(160)            NOT NULL,
        description     TEXT,
        status          work_order_task_status  NOT NULL DEFAULT 'PENDING',
        arrival_at      TIMESTAMPTZ,
        departure_at    TIMESTAMPTZ,
        result_notes    TEXT,
        created_at      TIMESTAMPTZ             NOT NULL DEFAULT now(),
        updated_at      TIMESTAMPTZ             NOT NULL DEFAULT now(),
        CONSTRAINT pk_work_order_tasks PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_work_order_tasks_tenant_work_order
        ON work_order_tasks (tenant_id, work_order_id)
    `);

    // ── schedule_reschedule_logs (append-only) ────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE schedule_reschedule_logs (
        id                  UUID          NOT NULL DEFAULT gen_random_uuid(),
        tenant_id           UUID          NOT NULL,
        schedule_event_id   UUID          NOT NULL,
        from_start_at       TIMESTAMPTZ   NOT NULL,
        from_end_at         TIMESTAMPTZ   NOT NULL,
        to_start_at         TIMESTAMPTZ   NOT NULL,
        to_end_at           TIMESTAMPTZ   NOT NULL,
        reason              VARCHAR(120)  NOT NULL,
        notes               TEXT,
        changed_by          UUID          NOT NULL,
        created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT pk_schedule_reschedule_logs PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_reschedule_logs_tenant_event
        ON schedule_reschedule_logs (tenant_id, schedule_event_id)
    `);

    // ── technician_availability ───────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE technician_availability (
        id          UUID                          NOT NULL DEFAULT gen_random_uuid(),
        tenant_id   UUID                          NOT NULL,
        user_id     UUID                          NOT NULL,
        type        technician_availability_type  NOT NULL,
        starts_at   TIMESTAMPTZ                   NOT NULL,
        ends_at     TIMESTAMPTZ                   NOT NULL,
        reason      VARCHAR(160),
        created_by  UUID                          NOT NULL,
        created_at  TIMESTAMPTZ                   NOT NULL DEFAULT now(),
        updated_at  TIMESTAMPTZ                   NOT NULL DEFAULT now(),
        CONSTRAINT pk_technician_availability PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_technician_availability_tenant_user
        ON technician_availability (tenant_id, user_id)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_technician_availability_tenant_range
        ON technician_availability (tenant_id, starts_at, ends_at)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Indices y tablas en orden inverso de creacion

    await queryRunner.query(`DROP INDEX IF EXISTS idx_technician_availability_tenant_range`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_technician_availability_tenant_user`);
    await queryRunner.query(`DROP TABLE IF EXISTS technician_availability`);

    await queryRunner.query(`DROP INDEX IF EXISTS idx_reschedule_logs_tenant_event`);
    await queryRunner.query(`DROP TABLE IF EXISTS schedule_reschedule_logs`);

    await queryRunner.query(`DROP INDEX IF EXISTS idx_work_order_tasks_tenant_work_order`);
    await queryRunner.query(`DROP TABLE IF EXISTS work_order_tasks`);

    await queryRunner.query(`DROP INDEX IF EXISTS idx_work_orders_tenant_assigned`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_work_orders_tenant_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_work_orders_tenant_code`);
    await queryRunner.query(`DROP TABLE IF EXISTS work_orders`);

    await queryRunner.query(`DROP INDEX IF EXISTS idx_schedule_events_tenant_ticket`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_schedule_events_tenant_expediente`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_schedule_events_tenant_status_start`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_schedule_events_tenant_assigned_start`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_schedule_events_tenant_start`);
    await queryRunner.query(`DROP TABLE IF EXISTS schedule_events`);

    await queryRunner.query(`DROP TYPE IF EXISTS technician_availability_type`);
    await queryRunner.query(`DROP TYPE IF EXISTS work_order_source_context`);
    await queryRunner.query(`DROP TYPE IF EXISTS work_order_priority`);
    await queryRunner.query(`DROP TYPE IF EXISTS work_order_task_status`);
    await queryRunner.query(`DROP TYPE IF EXISTS work_order_status`);
    await queryRunner.query(`DROP TYPE IF EXISTS schedule_event_status`);
    await queryRunner.query(`DROP TYPE IF EXISTS wfm_work_type`);
  }
}
