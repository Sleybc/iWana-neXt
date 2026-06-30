'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.CreateAssuranceModule1700000000031 = void 0;
/**
 * Migración 031: crea el esquema del Módulo Service Assurance / Mesa de Ayuda (MOD10) Fase 1.
 * - Tipos ENUM para estado de ticket, tipo, prioridad, tipo de solicitante, SLA y PQR.
 * - Tabla support_tickets con SLA, asignación y vínculo opcional a WFM.
 * - Tabla ticket_comments (internos y externos).
 * - Tabla ticket_timeline_events (append-only).
 * - Tabla ticket_sla_policies (políticas por tenant).
 * - Tabla ticket_pqr_records (plazos regulatorios CRC).
 * - Tabla ticket_work_order_links (referencia lógica a WFM).
 * - Índices de consulta por tenant, estado, asignado y tipo.
 *
 * Schema: tenant (search_path resuelto por TenantContext — sin prefijo explícito)
 * Reversible: sí — down() elimina tablas, índices y tipos ENUM en orden inverso.
 *
 * Referencias: ADR-038, HLD-MOD10-SERVICE-ASSURANCE-v1.0, PRD-MOD10
 */
class CreateAssuranceModule1700000000031 {
  name = 'CreateAssuranceModule1700000000031';
  async up(queryRunner) {
    // ── Tipos ENUM ────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE ticket_status AS ENUM (
        'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'PENDING_CUSTOMER',
        'PENDING_INTERNAL', 'FIELD_SERVICE_REQUESTED', 'RESOLVED', 'CLOSED', 'CANCELLED'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE ticket_type AS ENUM (
        'CUSTOMER_INCIDENT', 'PQR', 'QUESTION', 'SERVICE_REQUEST',
        'INTERNAL', 'INTERNAL_SUPPORT', 'OPERATIONAL_TASK', 'INQUIRY'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE ticket_priority AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT', 'CRITICAL')
    `);
    await queryRunner.query(`
      CREATE TYPE ticket_source AS ENUM (
        'MANUAL', 'PORTAL', 'EMAIL', 'NMS', 'WFM', 'MIGRATION', 'INTERNAL'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE ticket_requester_type AS ENUM (
        'SUBSCRIBER', 'INTERNAL_USER', 'EMPLOYEE', 'TECHNICIAN',
        'CONTRACTOR', 'PARTNER', 'SYSTEM', 'EXTERNAL', 'ANONYMOUS'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE ticket_subject_type AS ENUM (
        'SUBSCRIBER', 'CONTRACT', 'SERVICE', 'NETWORK_NODE',
        'DEVICE', 'WORK_ORDER', 'INTERNAL_AREA', 'GENERAL'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE ticket_queue AS ENUM (
        'SUPPORT', 'NOC', 'BILLING', 'OPERATIONS', 'SALES', 'ADMIN', 'IWANA_SUPPORT'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE ticket_field_decision AS ENUM (
        'NOT_REQUIRED', 'NEEDS_DIAGNOSIS', 'FIELD_SERVICE_REQUIRED'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE sla_breach_status AS ENUM (
        'OK', 'AT_RISK', 'FIRST_RESPONSE_BREACHED', 'RESOLUTION_BREACHED'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE pqr_deadline_type AS ENUM (
        'INITIAL_RESPONSE', 'FINAL_RESOLUTION', 'CORRECTION'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE ticket_timeline_event_type AS ENUM (
        'CREATED', 'ASSIGNED', 'REASSIGNED', 'STATUS_CHANGED', 'COMMENT_ADDED',
        'FIELD_SERVICE_REQUESTED', 'WORK_ORDER_LINKED', 'SLA_BREACHED',
        'PQR_DEADLINE_SET', 'PRIORITY_CHANGED', 'CLOSED'
      )
    `);
    // ── ticket_sla_policies ───────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE ticket_sla_policies (
        id                       UUID         NOT NULL DEFAULT gen_random_uuid(),
        tenant_id                UUID         NOT NULL,
        name                     VARCHAR(100) NOT NULL,
        applies_to_type          VARCHAR(50),
        applies_to_priority      VARCHAR(50),
        first_response_minutes   INT          NOT NULL,
        resolution_minutes       INT          NOT NULL,
        is_active                BOOLEAN      NOT NULL DEFAULT TRUE,
        created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_ticket_sla_policies PRIMARY KEY (id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_ticket_sla_policies_tenant ON ticket_sla_policies (tenant_id)
    `);
    // ── support_tickets ───────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE support_tickets (
        id                    UUID                  NOT NULL DEFAULT gen_random_uuid(),
        tenant_id             UUID                  NOT NULL,
        ticket_number         VARCHAR(30)           NOT NULL,
        type                  ticket_type           NOT NULL,
        status                ticket_status         NOT NULL DEFAULT 'OPEN',
        priority              ticket_priority       NOT NULL DEFAULT 'NORMAL',
        source                ticket_source         NOT NULL DEFAULT 'MANUAL',
        subject               VARCHAR(200)          NOT NULL,
        description           TEXT,
        requester_type        ticket_requester_type NOT NULL,
        requester_ref_id      VARCHAR(160),
        subject_type          ticket_subject_type,
        subject_ref_id        VARCHAR(160),
        assigned_user_id      UUID,
        queue_name            ticket_queue,
        sla_policy_id         UUID,
        sla_first_response_at TIMESTAMPTZ,
        sla_resolve_by_at     TIMESTAMPTZ,
        first_responded_at    TIMESTAMPTZ,
        resolved_at           TIMESTAMPTZ,
        closed_at             TIMESTAMPTZ,
        sla_breach_status     sla_breach_status     NOT NULL DEFAULT 'OK',
        field_decision        ticket_field_decision NOT NULL DEFAULT 'NOT_REQUIRED',
        work_order_id         UUID,
        created_by_user_id    UUID                  NOT NULL,
        created_at            TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_support_tickets PRIMARY KEY (id),
        CONSTRAINT uq_support_tickets_tenant_number UNIQUE (tenant_id, ticket_number)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_support_tickets_tenant_status ON support_tickets (tenant_id, status)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_support_tickets_tenant_assignee ON support_tickets (tenant_id, assigned_user_id)
        WHERE assigned_user_id IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX idx_support_tickets_tenant_type ON support_tickets (tenant_id, type)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_support_tickets_tenant_created ON support_tickets (tenant_id, created_at)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_support_tickets_tenant_requester ON support_tickets (tenant_id, requester_ref_id)
        WHERE requester_ref_id IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX idx_support_tickets_tenant_subject_ref ON support_tickets (tenant_id, subject_ref_id)
        WHERE subject_ref_id IS NOT NULL
    `);
    // ── ticket_comments ───────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE ticket_comments (
        id               UUID        NOT NULL DEFAULT gen_random_uuid(),
        ticket_id        UUID        NOT NULL,
        tenant_id        UUID        NOT NULL,
        body             TEXT        NOT NULL,
        is_internal      BOOLEAN     NOT NULL DEFAULT FALSE,
        author_user_id   UUID        NOT NULL,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_ticket_comments PRIMARY KEY (id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_ticket_comments_ticket ON ticket_comments (ticket_id)
    `);
    // ── ticket_timeline_events ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE ticket_timeline_events (
        id              UUID                       NOT NULL DEFAULT gen_random_uuid(),
        ticket_id       UUID                       NOT NULL,
        tenant_id       UUID                       NOT NULL,
        event_type      ticket_timeline_event_type NOT NULL,
        payload         JSONB                      NOT NULL DEFAULT '{}',
        actor_user_id   UUID,
        occurred_at     TIMESTAMPTZ                NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_ticket_timeline_events PRIMARY KEY (id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_ticket_timeline_ticket ON ticket_timeline_events (ticket_id, occurred_at)
    `);
    // ── ticket_pqr_records ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE ticket_pqr_records (
        id            UUID              NOT NULL DEFAULT gen_random_uuid(),
        ticket_id     UUID              NOT NULL,
        tenant_id     UUID              NOT NULL,
        pqr_number    VARCHAR(50),
        deadline_type pqr_deadline_type NOT NULL,
        deadline_at   TIMESTAMPTZ       NOT NULL,
        notified_at   TIMESTAMPTZ,
        resolved_at   TIMESTAMPTZ,
        notes         TEXT,
        created_at    TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_ticket_pqr_records PRIMARY KEY (id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_ticket_pqr_records_ticket ON ticket_pqr_records (ticket_id)
    `);
    // ── ticket_work_order_links ───────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE ticket_work_order_links (
        id                     UUID        NOT NULL DEFAULT gen_random_uuid(),
        ticket_id              UUID        NOT NULL,
        tenant_id              UUID        NOT NULL,
        work_order_id          UUID,
        requested_at           TIMESTAMPTZ NOT NULL,
        requested_by_user_id   UUID        NOT NULL,
        notes                  TEXT,
        created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_ticket_work_order_links PRIMARY KEY (id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_ticket_wo_links_ticket ON ticket_work_order_links (ticket_id)
    `);
  }
  async down(queryRunner) {
    await queryRunner.query(`DROP TABLE IF EXISTS ticket_work_order_links`);
    await queryRunner.query(`DROP TABLE IF EXISTS ticket_pqr_records`);
    await queryRunner.query(`DROP TABLE IF EXISTS ticket_timeline_events`);
    await queryRunner.query(`DROP TABLE IF EXISTS ticket_comments`);
    await queryRunner.query(`DROP TABLE IF EXISTS support_tickets`);
    await queryRunner.query(`DROP TABLE IF EXISTS ticket_sla_policies`);
    await queryRunner.query(`DROP TYPE IF EXISTS ticket_timeline_event_type`);
    await queryRunner.query(`DROP TYPE IF EXISTS pqr_deadline_type`);
    await queryRunner.query(`DROP TYPE IF EXISTS sla_breach_status`);
    await queryRunner.query(`DROP TYPE IF EXISTS ticket_field_decision`);
    await queryRunner.query(`DROP TYPE IF EXISTS ticket_queue`);
    await queryRunner.query(`DROP TYPE IF EXISTS ticket_subject_type`);
    await queryRunner.query(`DROP TYPE IF EXISTS ticket_requester_type`);
    await queryRunner.query(`DROP TYPE IF EXISTS ticket_source`);
    await queryRunner.query(`DROP TYPE IF EXISTS ticket_priority`);
    await queryRunner.query(`DROP TYPE IF EXISTS ticket_type`);
    await queryRunner.query(`DROP TYPE IF EXISTS ticket_status`);
  }
}
exports.CreateAssuranceModule1700000000031 = CreateAssuranceModule1700000000031;
//# sourceMappingURL=031_create_assurance_module.js.map
