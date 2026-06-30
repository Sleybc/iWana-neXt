'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.CreateVisitRequests1700000000034 = void 0;
/**
 * Migración 034: crea la tabla visit_requests en el schema de tenant.
 *
 * VisitRequest captura solicitudes operativas antes de convertirse en Work Orders
 * y Schedule Events. Mantiene el contexto de origen, ventana temporal solicitada,
 * vinculos con entidades de negocio (expediente, subscriber, ticket, contract)
 * y el flujo de estados desde PENDING hasta SCHEDULED | CANCELLED | REJECTED.
 *
 * Schema: tenant (search_path resuelto por TenantContext — sin prefijo explicito)
 * Reversible: si — down() elimina la tabla y el indice.
 *
 * Referencias: ADR-037, HLD-MOD09-PROGRAMACION-WFM-v1.0 §4, SPEC-MOD09 §6.2
 */
class CreateVisitRequests1700000000034 {
  name = 'CreateVisitRequests1700000000034';
  async up(queryRunner) {
    await queryRunner.query(`
      CREATE TYPE visit_request_status AS ENUM (
        'PENDING',
        'NEEDS_CONTEXT',
        'READY_TO_SCHEDULE',
        'SCHEDULED',
        'CANCELLED',
        'REJECTED',
        'EXPIRED'
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS visit_requests (
        id                        UUID                      PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id                 UUID                      NOT NULL,
        status                    visit_request_status      NOT NULL,
        origin_context            work_order_source_context NOT NULL,
        origin_ref                VARCHAR(160),
        origin_label              VARCHAR(160),
        work_type                 wfm_work_type             NOT NULL,
        priority                  work_order_priority       NOT NULL,
        title                     VARCHAR(160)              NOT NULL,
        description               TEXT,
        requested_window_start_at TIMESTAMPTZ,
        requested_window_end_at   TIMESTAMPTZ,
        sla_due_at                TIMESTAMPTZ,
        address                   VARCHAR(255),
        municipality              VARCHAR(120),
        sector                    VARCHAR(120),
        latitude                  NUMERIC(10, 7),
        longitude                 NUMERIC(10, 7),
        expediente_id             UUID,
        subscriber_id             UUID,
        ticket_id                 VARCHAR(160),
        contract_id               UUID,
        schedule_event_id         UUID,
        work_order_id             UUID,
        requested_by_user_id      UUID                      NOT NULL,
        scheduled_by_user_id      UUID,
        scheduled_at              TIMESTAMPTZ,
        cancelled_at              TIMESTAMPTZ,
        cancelled_by_user_id      UUID,
        cancel_reason             VARCHAR(200),
        created_at                TIMESTAMPTZ               NOT NULL DEFAULT now(),
        updated_at                TIMESTAMPTZ               NOT NULL DEFAULT now(),
        deleted_at                TIMESTAMPTZ
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_visit_requests_tenant_status_created
        ON visit_requests (tenant_id, status, created_at)
    `);
  }
  async down(queryRunner) {
    await queryRunner.query(`DROP TABLE IF EXISTS visit_requests CASCADE`);
    await queryRunner.query(`DROP TYPE IF EXISTS visit_request_status`);
  }
}
exports.CreateVisitRequests1700000000034 = CreateVisitRequests1700000000034;
//# sourceMappingURL=034_create_visit_requests.js.map
