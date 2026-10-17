import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migracion 152: agrega el origen TASKS al enum work_order_source_context.
 *
 * El contrato compartido `WorkOrderSourceContext` publica `TASKS` y los
 * servicios de WFM y `tasks` lo producen, pero la 030 creó el tipo sin ese
 * valor: crear una visita o una orden de trabajo con origen TASKS fallaba con
 * 22P02. El tipo lo usan `work_orders.source_context` y
 * `visit_requests.origin_context`.
 *
 * Transacción: corre en la transacción por migración del runner (default).
 * PostgreSQL ≥ 12 admite `ALTER TYPE … ADD VALUE` dentro de una transacción
 * siempre que el valor nuevo no se use antes del commit; esta migración no lo
 * usa y cada migración del runner confirma por separado (patrón de la 058 y
 * la 107).
 *
 * Ámbito de la guarda: `pg_enum`/`pg_type` abarcan toda la base. Se filtra por
 * `current_schema()` para no ver el enum de otro tenant ya migrado (ver 058).
 *
 * Estrategia de reversa (down):
 * PostgreSQL no permite DROP VALUE. Si alguna fila de `work_orders` o de
 * `visit_requests` usa TASKS, down() no cambia nada (no-op documentado: quitar
 * el valor exigiría reescribir el origen de esas filas). Si ninguna lo usa,
 * recrea el tipo sin TASKS y migra las dos columnas; los índices que las
 * incluyen se reconstruyen con el ALTER COLUMN TYPE. Las comparaciones van
 * como texto para no depender de que el valor exista.
 */
export class WorkOrderSourceContextTasks1520000000000 implements MigrationInterface {
  name = 'WorkOrderSourceContextTasks1520000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'work_order_source_context'
            AND t.typnamespace = current_schema()::regnamespace
            AND e.enumlabel = 'TASKS'
        ) THEN
          ALTER TYPE work_order_source_context ADD VALUE 'TASKS';
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const usage = (await queryRunner.query(`
      SELECT
        (SELECT COUNT(*)::int FROM work_orders WHERE source_context::text = 'TASKS') AS "workOrders",
        (SELECT COUNT(*)::int FROM visit_requests WHERE origin_context::text = 'TASKS') AS "visitRequests"
    `)) as Array<{ workOrders: number; visitRequests: number }>;
    const workOrders = usage[0]?.workOrders ?? 0;
    const visitRequests = usage[0]?.visitRequests ?? 0;

    if (workOrders > 0 || visitRequests > 0) {
      console.warn(
        `[152] down sin cambios: TASKS en uso (work_orders=${workOrders}, visit_requests=${visitRequests}).`,
      );
      return;
    }

    await queryRunner.query(`
      ALTER TYPE work_order_source_context
      RENAME TO work_order_source_context_old
    `);

    await queryRunner.query(`
      CREATE TYPE work_order_source_context AS ENUM (
        'CRM', 'ASSURANCE', 'PROVISIONING', 'MANUAL'
      )
    `);

    await queryRunner.query(`
      ALTER TABLE work_orders
      ALTER COLUMN source_context TYPE work_order_source_context
      USING source_context::text::work_order_source_context
    `);

    await queryRunner.query(`
      ALTER TABLE visit_requests
      ALTER COLUMN origin_context TYPE work_order_source_context
      USING origin_context::text::work_order_source_context
    `);

    await queryRunner.query(`DROP TYPE IF EXISTS work_order_source_context_old`);
  }
}
