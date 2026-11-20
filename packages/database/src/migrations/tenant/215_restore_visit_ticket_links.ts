import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración tenant 215: restaura el ticket que perdieron las solicitudes de visita.
 *
 * Hasta `7a5955ab` (2026-11-17) guardar el contexto de una solicitud de visita trataba los
 * campos no enviados como «borrar» y dejaba `visit_requests.ticket_id` en NULL. La orden de
 * ejecución nacida de esa visita quedaba sin ticket, y su cierre no llegaba al historial del
 * ticket.
 *
 * Fuente de la restauración: el registro de auditoría de la creación de la solicitud
 * (`audit_logs`, acción CREATE, `new_value.ticketId`). Solo se restaura si la fila sigue en
 * NULL y el ticket existe en el tenant. Desde la solicitud se propaga a su evento de agenda y
 * a su orden de ejecución, también solo donde siguen en NULL. Por cada orden restaurada se
 * añade al historial del ticket el vínculo y, si la orden ya cerró, su cierre con la fecha
 * real. El estado del ticket no cambia: el cierre de una orden nunca lo ha cambiado.
 *
 * Reversa (down): `migration_215_restored_ticket_links` guarda cada fila tocada. down() borra
 * los eventos que insertó, devuelve a NULL solo las filas que siguen con el ticket restaurado
 * y elimina la tabla. No destruye datos previos a up().
 */
export class RestoreVisitTicketLinks2150000000215 implements MigrationInterface {
  name = 'RestoreVisitTicketLinks2150000000215';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS migration_215_restored_ticket_links (
        table_name TEXT NOT NULL,
        row_id UUID NOT NULL,
        ticket_id UUID NOT NULL,
        PRIMARY KEY (table_name, row_id)
      )
    `);

    await queryRunner.query(`
      WITH source AS (
        SELECT DISTINCT ON (vr.id) vr.id, st.id AS ticket_id
          FROM visit_requests vr
          JOIN audit_logs a
            ON a.tenant_id = vr.tenant_id
           AND a.entity_id = vr.id::text
           AND a.action = 'CREATE'
           AND a.new_value->>'id' = vr.id::text
           AND NULLIF(a.new_value->>'ticketId', '') IS NOT NULL
          JOIN support_tickets st
            ON st.tenant_id = vr.tenant_id
           AND st.id::text = a.new_value->>'ticketId'
         WHERE vr.ticket_id IS NULL
         ORDER BY vr.id, a.created_at
      ), restored AS (
        UPDATE visit_requests vr
           SET ticket_id = source.ticket_id::text
          FROM source
         WHERE vr.id = source.id AND vr.ticket_id IS NULL
        RETURNING vr.id, source.ticket_id
      )
      INSERT INTO migration_215_restored_ticket_links (table_name, row_id, ticket_id)
      SELECT 'visit_requests', id, ticket_id FROM restored
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      WITH restored AS (
        UPDATE schedule_events se
           SET ticket_id = link.ticket_id::text
          FROM migration_215_restored_ticket_links link
          JOIN visit_requests vr ON vr.id = link.row_id
         WHERE link.table_name = 'visit_requests'
           AND se.id = vr.schedule_event_id
           AND se.tenant_id = vr.tenant_id
           AND se.ticket_id IS NULL
        RETURNING se.id, link.ticket_id
      )
      INSERT INTO migration_215_restored_ticket_links (table_name, row_id, ticket_id)
      SELECT 'schedule_events', id, ticket_id FROM restored
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      WITH restored AS (
        UPDATE execution_orders eo
           SET ticket_id = link.ticket_id::text
          FROM migration_215_restored_ticket_links link
          JOIN visit_requests vr ON vr.id = link.row_id
         WHERE link.table_name = 'visit_requests'
           AND (eo.id = vr.execution_order_id OR eo.visit_request_id = vr.id)
           AND eo.tenant_id = vr.tenant_id
           AND eo.ticket_id IS NULL
           AND eo.is_annulled = false
        RETURNING eo.id, link.ticket_id
      )
      INSERT INTO migration_215_restored_ticket_links (table_name, row_id, ticket_id)
      SELECT 'execution_orders', id, ticket_id FROM restored
      ON CONFLICT DO NOTHING
    `);

    const restoredOrders = (await queryRunner.query(`
      SELECT count(*)::int AS total
        FROM migration_215_restored_ticket_links
       WHERE table_name = 'execution_orders'
    `)) as Array<{ total: number }>;
    if (!restoredOrders[0]?.total) return;

    await queryRunner.query(`
      INSERT INTO ticket_timeline_events
        (id, ticket_id, tenant_id, event_type, payload, actor_user_id, occurred_at)
      SELECT gen_random_uuid(), link.ticket_id, eo.tenant_id, 'WORK_ORDER_LINKED',
             jsonb_build_object(
               'executionOrderId', eo.id,
               'executionOrderNumber', eo.execution_order_number,
               'notes', 'Vínculo restaurado: la solicitud de visita había perdido su ticket.',
               'restoredByMigration', 215
             ),
             NULL, now()
        FROM migration_215_restored_ticket_links link
        JOIN execution_orders eo ON eo.id = link.row_id
       WHERE link.table_name = 'execution_orders'
         AND NOT EXISTS (
           SELECT 1 FROM ticket_timeline_events done
            WHERE done.ticket_id = link.ticket_id
              AND done.event_type = 'WORK_ORDER_LINKED'
              AND done.payload->>'restoredByMigration' = '215'
              AND done.payload->>'executionOrderId' = eo.id::text
         )
    `);

    await queryRunner.query(`
      INSERT INTO ticket_timeline_events
        (id, ticket_id, tenant_id, event_type, payload, actor_user_id, occurred_at)
      SELECT gen_random_uuid(), link.ticket_id, eo.tenant_id, 'EXECUTION_ORDER_CLOSED',
             jsonb_build_object(
               'executionOrderId', eo.id,
               'result', eo.result,
               'restoredByMigration', 215
             ),
             NULL, eo.closed_at
        FROM migration_215_restored_ticket_links link
        JOIN execution_orders eo ON eo.id = link.row_id
       WHERE link.table_name = 'execution_orders'
         AND eo.closed_at IS NOT NULL
         AND eo.result IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM ticket_timeline_events done
            WHERE done.ticket_id = link.ticket_id
              AND done.event_type = 'EXECUTION_ORDER_CLOSED'
              AND done.payload->>'restoredByMigration' = '215'
              AND done.payload->>'executionOrderId' = eo.id::text
         )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const exists = (await queryRunner.query(
      `SELECT to_regclass('migration_215_restored_ticket_links') IS NOT NULL AS present`,
    )) as Array<{ present: boolean }>;
    if (!exists[0]?.present) return;

    await queryRunner.query(`
      DELETE FROM ticket_timeline_events
       WHERE payload->>'restoredByMigration' = '215'
    `);
    for (const table of ['execution_orders', 'schedule_events', 'visit_requests']) {
      await queryRunner.query(
        `UPDATE ${table} target
            SET ticket_id = NULL
           FROM migration_215_restored_ticket_links link
          WHERE link.table_name = $1
            AND target.id = link.row_id
            AND target.ticket_id = link.ticket_id::text`,
        [table],
      );
    }
    await queryRunner.query(`DROP TABLE migration_215_restored_ticket_links`);
  }
}
