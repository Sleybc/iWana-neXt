import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración tenant 214: agrega EXECUTION_ORDER_CLOSED al enum
 * ticket_timeline_event_type.
 *
 * El enum TypeScript `TicketTimelineEventType` incluye el valor y el adaptador
 * `AssuranceExecutionOrderNotifierAdapter` lo escribe en `ticket_timeline_events`
 * dentro de la transacción de cierre de una orden de ejecución con ticket, pero
 * la 031 creó el tipo sin él: Postgres rechazaba la inserción y revertía el cierre.
 *
 * `ADD VALUE IF NOT EXISTS` sin calificar actúa sobre el tipo del schema del
 * `search_path` del tenant, así que es idempotente por schema.
 *
 * Reversa (down): PostgreSQL no permite DROP VALUE. Si algún evento usa el
 * valor, down() es no-op documentado (borrar el historial no es reversible).
 * Si no hay filas, recrea el tipo con los valores de la 031.
 */
export class AddExecutionOrderClosedTimelineEvent2140000000214 implements MigrationInterface {
  name = 'AddExecutionOrderClosedTimelineEvent2140000000214';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE ticket_timeline_event_type ADD VALUE IF NOT EXISTS 'EXECUTION_ORDER_CLOSED'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const usage = (await queryRunner.query(`
      SELECT EXISTS (
        SELECT 1
        FROM ticket_timeline_events
        WHERE event_type = 'EXECUTION_ORDER_CLOSED'
        LIMIT 1
      ) AS "inUse"
    `)) as Array<{ inUse: boolean }>;

    if (usage[0]?.inUse) {
      return;
    }

    await queryRunner.query(
      `ALTER TYPE ticket_timeline_event_type RENAME TO ticket_timeline_event_type_old`,
    );
    await queryRunner.query(`
      CREATE TYPE ticket_timeline_event_type AS ENUM (
        'CREATED', 'ASSIGNED', 'REASSIGNED', 'STATUS_CHANGED', 'COMMENT_ADDED',
        'FIELD_SERVICE_REQUESTED', 'WORK_ORDER_LINKED', 'SLA_BREACHED',
        'PQR_DEADLINE_SET', 'PRIORITY_CHANGED', 'CLOSED'
      )
    `);
    await queryRunner.query(`
      ALTER TABLE ticket_timeline_events
      ALTER COLUMN event_type TYPE ticket_timeline_event_type
      USING event_type::text::ticket_timeline_event_type
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS ticket_timeline_event_type_old`);
  }
}
