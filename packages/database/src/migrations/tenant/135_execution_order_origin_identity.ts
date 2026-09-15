import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 135: la OT deja de exigir una cita para existir (MOD11 E1, ADR-091 §D1).
 *
 * - `schedule_event_id`, `planned_window_start_at` y `planned_window_end_at`
 *   pasan a NULL: la ventana es un atributo que puede llegar después (E3), no
 *   una precondición de existencia. Las filas existentes no cambian de contenido.
 * - La clave de idempotencia se muda al eje de ADR-076 (Aprobado) §D1 con el
 *   mismo patrón que `idx_visit_requests_active_origin_unique` (migración 035):
 *   índice único parcial sobre la tupla de origen activa. `origin_ref_id IS NULL`
 *   queda fuera de deduplicación (ADR-076 §D4, sin ampliar la excepción) y la OT
 *   no tiene borrado lógico, así que el predicado no incluye `deleted_at`.
 * - El índice `uq_execution_orders_tenant_schedule_event` (091) se reexpresa
 *   como parcial `WHERE schedule_event_id IS NOT NULL`: en PostgreSQL los nulos
 *   nunca colisionaron en un único, así que la semántica para OT agendadas no
 *   cambia; la forma parcial declara que las OT sin evento están fuera de esa
 *   clave y mantiene el índice acotado al camino de agenda.
 *
 * Terminalidad para el predicado: CANCELLED, COMPLETED,
 * COMPLETED_WITH_OBSERVATIONS y NOT_EXECUTED. BLOCKED sigue siendo trabajo
 * vivo (se puede desbloquear) y CREATED/ASSIGNED/EN_ROUTE/IN_PROGRESS son
 * activos por definición.
 */
export class ExecutionOrderOriginIdentity1350000000000 implements MigrationInterface {
  name = 'ExecutionOrderOriginIdentity1350000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const duplicates = (await queryRunner.query(
      `SELECT tenant_id, origin_context, TRIM(origin_ref_id) AS origin_ref, work_type, COUNT(*)::int AS total
         FROM execution_orders
        WHERE origin_ref_id IS NOT NULL
          AND status NOT IN ('CANCELLED', 'COMPLETED', 'COMPLETED_WITH_OBSERVATIONS', 'NOT_EXECUTED')
        GROUP BY tenant_id, origin_context, TRIM(origin_ref_id), work_type
        HAVING COUNT(*) > 1
        LIMIT 5`,
    )) as Array<{
      tenant_id: string;
      origin_context: string;
      origin_ref: string;
      work_type: string;
      total: number;
    }>;

    if (duplicates.length > 0) {
      const sample = duplicates
        .map((row) => `${row.origin_context}/${row.origin_ref}/${row.work_type} x${row.total}`)
        .join('; ');
      throw new Error(
        `Migración 135 bloqueada: existen OT activas duplicadas por origen (${sample}). ` +
          `Resuelva la duplicación antes de instalar la guarda de unicidad ` +
          `(cancele o cierre las OT sobrantes por tenant).`,
      );
    }

    await queryRunner.query(
      `ALTER TABLE execution_orders ALTER COLUMN schedule_event_id DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE execution_orders ALTER COLUMN planned_window_start_at DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE execution_orders ALTER COLUMN planned_window_end_at DROP NOT NULL`,
    );

    await queryRunner.query(`DROP INDEX IF EXISTS uq_execution_orders_tenant_schedule_event`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_execution_orders_tenant_schedule_event
         ON execution_orders (tenant_id, schedule_event_id)
        WHERE schedule_event_id IS NOT NULL`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_execution_orders_active_origin_unique
         ON execution_orders (tenant_id, origin_context, origin_ref_id, work_type)
        WHERE origin_ref_id IS NOT NULL
          AND status NOT IN ('CANCELLED', 'COMPLETED', 'COMPLETED_WITH_OBSERVATIONS', 'NOT_EXECUTED')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Límite declarado (spec §4 / CA-04, patrón de conteo de la 098): una vez
    // que existen OT sin evento o sin ventana, restaurar NOT NULL no es
    // expresable sin destruir datos, y ningún consentimiento lo vuelve válido
    // —a diferencia de la 098, aquí no hay DDL destructivo alternativo (la vía
    // sería borrar OTs, prohibido). Por eso este down falla siempre ante esas
    // filas, sin bypass por variable de entorno, y lo dice en el mensaje.
    const rows = (await queryRunner.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE schedule_event_id IS NULL)::int AS without_event,
              COUNT(*) FILTER (WHERE planned_window_start_at IS NULL OR planned_window_end_at IS NULL)::int AS without_window
         FROM execution_orders
        WHERE schedule_event_id IS NULL
           OR planned_window_start_at IS NULL
           OR planned_window_end_at IS NULL`,
    )) as Array<{ total: number; without_event: number; without_window: number }>;
    const affected = rows[0]?.total ?? 0;
    if (affected > 0) {
      throw new Error(
        `Rollback de ExecutionOrderOriginIdentity bloqueado: ` +
          `${affected} OT(s) sin evento (${rows[0]?.without_event ?? 0}) o sin ventana ` +
          `(${rows[0]?.without_window ?? 0}) impiden restaurar NOT NULL. ` +
          `Vincule cada OT a su evento de agenda (MOD11 E3) o archívela por el camino ` +
          `gobernado antes de revertir; este down no borra OTs ni admite bypass.`,
      );
    }

    await queryRunner.query(`DROP INDEX IF EXISTS uq_execution_orders_active_origin_unique`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_execution_orders_tenant_schedule_event`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_execution_orders_tenant_schedule_event
         ON execution_orders (tenant_id, schedule_event_id)`,
    );

    await queryRunner.query(
      `ALTER TABLE execution_orders ALTER COLUMN schedule_event_id SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE execution_orders ALTER COLUMN planned_window_start_at SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE execution_orders ALTER COLUMN planned_window_end_at SET NOT NULL`,
    );
  }
}
