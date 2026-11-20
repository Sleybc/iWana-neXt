import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración tenant 216: pone al día los tickets de instalación cuya orden ya cerró ejecutada.
 *
 * Desde `3e581ddf` el ticket de instalación automático (tarea operativa sobre un expediente)
 * pasa a RESOLVED cuando su orden de ejecución cierra como EXECUTED. La regla actúa en el
 * momento del cierre, así que los tickets cuya orden cerró antes siguen abiertos; entre ellos
 * los que la migración 215 acaba de volver a vincular.
 *
 * Solo toca tickets que no están resueltos, cerrados ni cancelados, con una orden no anulada
 * cerrada como EXECUTED y sin otra orden todavía abierta. `resolved_at` toma la fecha real del
 * cierre de la orden. `sla_breach_status` no se recalcula.
 *
 * Reversa (down): cada cambio deja en el historial un STATUS_CHANGED con el estado anterior y
 * `restoredByMigration: 216`. down() devuelve a ese estado los tickets que siguen en RESOLVED
 * y borra esos eventos.
 */
export class ResolveInstallationTicketsWithExecutedOrder2160000000216 implements MigrationInterface {
  name = 'ResolveInstallationTicketsWithExecutedOrder2160000000216';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      WITH target AS (
        SELECT DISTINCT ON (st.id)
               st.id, st.tenant_id, st.status::text AS previous_status,
               (st.first_responded_at IS NULL) AS first_response_was_null,
               eo.id AS execution_order_id, eo.closed_at
          FROM support_tickets st
          JOIN execution_orders eo
            ON eo.tenant_id = st.tenant_id
           AND eo.ticket_id = st.id::text
           AND eo.is_annulled = false
           AND eo.result::text = 'EXECUTED'
           AND eo.closed_at IS NOT NULL
         WHERE st.type::text = 'OPERATIONAL_TASK'
           AND st.subject_type::text = 'EXPEDIENTE'
           AND st.status::text NOT IN ('RESOLVED', 'CLOSED', 'CANCELLED')
           AND NOT EXISTS (
             SELECT 1 FROM execution_orders pending
              WHERE pending.tenant_id = st.tenant_id
                AND pending.ticket_id = st.id::text
                AND pending.is_annulled = false
                AND pending.closed_at IS NULL
           )
         ORDER BY st.id, eo.closed_at DESC
      ), resolved AS (
        UPDATE support_tickets st
           SET status = 'RESOLVED',
               resolved_at = target.closed_at,
               first_responded_at = COALESCE(st.first_responded_at, target.closed_at)
          FROM target
         WHERE st.id = target.id
        RETURNING st.id
      )
      INSERT INTO ticket_timeline_events
        (id, ticket_id, tenant_id, event_type, payload, actor_user_id, occurred_at)
      SELECT gen_random_uuid(), target.id, target.tenant_id, 'STATUS_CHANGED',
             jsonb_build_object(
               'from', target.previous_status,
               'to', 'RESOLVED',
               'notes', 'Resuelto automáticamente: la orden de instalación cerró como ejecutada.',
               'automatic', true,
               'executionOrderId', target.execution_order_id,
               'firstRespondedAtWasNull', target.first_response_was_null,
               'restoredByMigration', 216
             ),
             NULL, now()
        FROM target
        JOIN resolved ON resolved.id = target.id
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE support_tickets st
         SET status = (event.payload->>'from')::ticket_status,
             resolved_at = NULL,
             first_responded_at = CASE
               WHEN (event.payload->>'firstRespondedAtWasNull')::boolean THEN NULL
               ELSE st.first_responded_at
             END
        FROM ticket_timeline_events event
       WHERE event.ticket_id = st.id
         AND event.payload->>'restoredByMigration' = '216'
         AND st.status::text = 'RESOLVED'
    `);
    await queryRunner.query(`
      DELETE FROM ticket_timeline_events
       WHERE payload->>'restoredByMigration' = '216'
    `);
  }
}
