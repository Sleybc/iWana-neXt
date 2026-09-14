import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * UUID centinela que marca un asiento anonimizado por vencimiento de retención
 * (MOD11, dictamen B3 exigencia 3 + spec §4.3).
 *
 * El nil-UUID nunca lo produce `gen_random_uuid()`, así que no colisiona con
 * ningún actor real. `NULL` queda reservado a «nunca se registró» (el writer
 * T1 siempre exige actor, así que hoy solo aparece por vías futuras): T3
 * distingue `changed_by = sentinel` (venció) de `changed_by IS NULL` (nunca
 * registrado) con dos predicados disjuntos (CA-07).
 *
 * La purga NUNCA escribe NULL ni toca filas NULL: la distinción sobrevive a
 * todas las corridas.
 */
export const TRANSITION_RETENTION_ANONYMIZED_SENTINEL = '00000000-0000-0000-0000-000000000000';

/** Estados terminales de la OT (misma terna que `assertMutable`/`isTerminal` del servicio). */
const TERMINAL_STATUSES_SQL = `'COMPLETED', 'COMPLETED_WITH_OBSERVATIONS', 'NOT_EXECUTED', 'CANCELLED'`;

/**
 * SQL literal de la función creada por la migración 101. Se conserva como
 * constante para que `down()` la restaure EXACTA (misma firma, mismo cuerpo):
 * una migración es una foto inmutable y revertir la 134 debe dejar el schema
 * como lo dejó la 101 (el historial no se reescribe).
 */
const PRE_134_PURGE_FUNCTION_SQL = `
      CREATE OR REPLACE FUNCTION purge_execution_order_retention_batch(batch_size INTEGER DEFAULT 500)
       RETURNS TABLE (
         idempotency_records_deleted BIGINT,
         outbox_events_deleted BIGINT,
         inbox_events_deleted BIGINT,
         audit_intents_deleted BIGINT,
         evidence_upload_intents_deleted BIGINT
       )
       LANGUAGE plpgsql
       AS $function$
       DECLARE
         deleted_count BIGINT;
         idempotency_deleted BIGINT := 0;
         outbox_deleted BIGINT := 0;
         inbox_deleted BIGINT := 0;
         audit_deleted BIGINT := 0;
         evidence_deleted BIGINT := 0;
       BEGIN
         IF batch_size IS NULL OR batch_size < 1 OR batch_size > 10000 THEN
           RAISE EXCEPTION 'batch_size must be between 1 and 10000';
         END IF;

         WITH victims AS (
           SELECT id FROM execution_order_idempotency_records
           WHERE expires_at <= NOW()
             AND (
               result_status <> 'PENDING'
               OR created_at <= NOW() - INTERVAL '90 days'
             )
           ORDER BY expires_at, id
           LIMIT batch_size
         )
         DELETE FROM execution_order_idempotency_records target
         USING victims
         WHERE target.id = victims.id;
         GET DIAGNOSTICS deleted_count = ROW_COUNT;
         idempotency_deleted := deleted_count;

         WITH victims AS (
           SELECT id FROM execution_order_outbox_events
           WHERE published_at IS NOT NULL
             AND published_at <= NOW() - INTERVAL '30 days'
           ORDER BY published_at, id
           LIMIT batch_size
         )
         DELETE FROM execution_order_outbox_events target
         USING victims
         WHERE target.id = victims.id;
         GET DIAGNOSTICS deleted_count = ROW_COUNT;
         outbox_deleted := deleted_count;

         WITH victims AS (
           SELECT id FROM execution_order_inbox_events
           WHERE processed_at IS NOT NULL
             AND processed_at <= NOW() - INTERVAL '30 days'
           ORDER BY processed_at, id
           LIMIT batch_size
         )
         DELETE FROM execution_order_inbox_events target
         USING victims
         WHERE target.id = victims.id;
         GET DIAGNOSTICS deleted_count = ROW_COUNT;
         inbox_deleted := deleted_count;

         WITH victims AS (
           SELECT id FROM execution_order_audit_intents
           WHERE delivered_at IS NOT NULL
             AND delivered_at <= NOW() - INTERVAL '30 days'
           ORDER BY delivered_at, id
           LIMIT batch_size
         )
         DELETE FROM execution_order_audit_intents target
         USING victims
         WHERE target.id = victims.id;
         GET DIAGNOSTICS deleted_count = ROW_COUNT;
         audit_deleted := deleted_count;

         WITH victims AS (
           SELECT intent.id
           FROM execution_order_evidence_upload_intents intent
           WHERE intent.expires_at IS NOT NULL
             AND intent.expires_at <= NOW()
             AND NOT EXISTS (
               SELECT 1
               FROM execution_order_idempotency_records idem
               WHERE idem.evidence_upload_intent_id = intent.id
             )
           ORDER BY intent.expires_at, intent.id
           LIMIT batch_size
         )
         DELETE FROM execution_order_evidence_upload_intents target
         USING victims
         WHERE target.id = victims.id;
         GET DIAGNOSTICS deleted_count = ROW_COUNT;
         evidence_deleted := deleted_count;

         RETURN QUERY SELECT idempotency_deleted, outbox_deleted, inbox_deleted,
           audit_deleted, evidence_deleted;
       END
       $function$`;

/**
 * Migración 134: retención de la línea de tiempo de la OT (MOD11).
 *
 * Extiende `purge_execution_order_retention_batch` con la tabla de
 * transiciones bajo la regla del dictamen B3 exigencia 3: 24 meses desde el
 * cierre o cancelación de la OT. Los cinco pasos previos (idempotencia,
 * outbox, inbox, auditoría, intents de evidencia) quedan intactos.
 *
 * - ANONIMIZA, no borra (spec §4.1): `changed_by = sentinel`, `reason = NULL`;
 *   `from_status`, `to_status` y `changed_at` sobreviven (CA-01/CA-02/CA-05).
 * - Correlacionada con la OT padre, NO por antigüedad de la fila: la OT debe
 *   estar en estado terminal y el instante de referencia es el último asiento
 *   de cierre/cancelación (no-corrección), en su defecto `closedAt`. Sin
 *   ninguno de los dos, la OT no vence: prohibido inventar cierres (CA-03).
 * - La corrección aditiva no reinicia el plazo: los asientos con
 *   `correction_of_id IS NOT NULL` se excluyen del cómputo del instante de
 *   referencia (pero SÍ se anonimizan: su actor también es PII) (CA-06).
 * - `changed_by` pasa a anulable; el vencido usa el centinela y NULL queda
 *   reservado a «nunca se registró» (CA-07, spec §4.3).
 * - Sin cron nuevo: corre dentro del procesador existente (CA-08).
 *
 * Schema: tenant (`search_path` del runner; sin prefijo explícito). Sin DML
 * (regla ADR-066 §4). Cero PII.
 */
export class AnonymizeExecutionOrderTransitionRetention1340000000000 implements MigrationInterface {
  name = 'AnonymizeExecutionOrderTransitionRetention1340000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Decisión §4.3: columna anulable + centinela (ver constante exportada).
    await queryRunner.query(`
      ALTER TABLE execution_order_status_transitions
        ALTER COLUMN changed_by DROP NOT NULL
    `);

    // Soporta la condición correlacionada: víctimas pendientes ordenadas por
    // instante + join a la OT padre. Parcial sobre filas no-anonimizadas: las
    // ya purgadas salen del índice y el barrido nocturno no las recorre.
    // CREATE simple (no CONCURRENTLY): la tabla es nueva y casi vacía; así la
    // migración sigue el camino transaccional del runner (patrón 133).
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_execution_order_status_transitions_retention
        ON execution_order_status_transitions (execution_order_id, changed_at)
        WHERE changed_by IS NOT NULL
          AND changed_by <> '${TRANSITION_RETENTION_ANONYMIZED_SENTINEL}'::uuid
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION purge_execution_order_retention_batch(batch_size INTEGER DEFAULT 500)
       RETURNS TABLE (
         idempotency_records_deleted BIGINT,
         outbox_events_deleted BIGINT,
         inbox_events_deleted BIGINT,
         audit_intents_deleted BIGINT,
         evidence_upload_intents_deleted BIGINT,
         status_transitions_anonymized BIGINT
       )
       LANGUAGE plpgsql
       AS $function$
       DECLARE
         deleted_count BIGINT;
         idempotency_deleted BIGINT := 0;
         outbox_deleted BIGINT := 0;
         inbox_deleted BIGINT := 0;
         audit_deleted BIGINT := 0;
         evidence_deleted BIGINT := 0;
         transitions_anonymized BIGINT := 0;
       BEGIN
         IF batch_size IS NULL OR batch_size < 1 OR batch_size > 10000 THEN
           RAISE EXCEPTION 'batch_size must be between 1 and 10000';
         END IF;

         WITH victims AS (
           SELECT id FROM execution_order_idempotency_records
           WHERE expires_at <= NOW()
             AND (
               result_status <> 'PENDING'
               OR created_at <= NOW() - INTERVAL '90 days'
             )
           ORDER BY expires_at, id
           LIMIT batch_size
         )
         DELETE FROM execution_order_idempotency_records target
         USING victims
         WHERE target.id = victims.id;
         GET DIAGNOSTICS deleted_count = ROW_COUNT;
         idempotency_deleted := deleted_count;

         WITH victims AS (
           SELECT id FROM execution_order_outbox_events
           WHERE published_at IS NOT NULL
             AND published_at <= NOW() - INTERVAL '30 days'
           ORDER BY published_at, id
           LIMIT batch_size
         )
         DELETE FROM execution_order_outbox_events target
         USING victims
         WHERE target.id = victims.id;
         GET DIAGNOSTICS deleted_count = ROW_COUNT;
         outbox_deleted := deleted_count;

         WITH victims AS (
           SELECT id FROM execution_order_inbox_events
           WHERE processed_at IS NOT NULL
             AND processed_at <= NOW() - INTERVAL '30 days'
           ORDER BY processed_at, id
           LIMIT batch_size
         )
         DELETE FROM execution_order_inbox_events target
         USING victims
         WHERE target.id = victims.id;
         GET DIAGNOSTICS deleted_count = ROW_COUNT;
         inbox_deleted := deleted_count;

         WITH victims AS (
           SELECT id FROM execution_order_audit_intents
           WHERE delivered_at IS NOT NULL
             AND delivered_at <= NOW() - INTERVAL '30 days'
           ORDER BY delivered_at, id
           LIMIT batch_size
         )
         DELETE FROM execution_order_audit_intents target
         USING victims
         WHERE target.id = victims.id;
         GET DIAGNOSTICS deleted_count = ROW_COUNT;
         audit_deleted := deleted_count;

         WITH victims AS (
           SELECT intent.id
           FROM execution_order_evidence_upload_intents intent
           WHERE intent.expires_at IS NOT NULL
             AND intent.expires_at <= NOW()
             AND NOT EXISTS (
               SELECT 1
               FROM execution_order_idempotency_records idem
               WHERE idem.evidence_upload_intent_id = intent.id
             )
           ORDER BY intent.expires_at, intent.id
           LIMIT batch_size
         )
         DELETE FROM execution_order_evidence_upload_intents target
         USING victims
         WHERE target.id = victims.id;
         GET DIAGNOSTICS deleted_count = ROW_COUNT;
         evidence_deleted := deleted_count;

         -- Paso 6 (MOD11 retención, dictamen B3 exigencia 3): anonimiza los
         -- asientos de OT vencidas. Vence a los 24 meses del cierre o
         -- cancelación: último asiento terminal no-corrección, en su defecto
         -- closed_at de la OT. La OT abierta nunca vence (filtro por estado
         -- del padre, no por antigüedad de la fila). Solo pierde el vínculo
         -- personal (actor + motivo); la forma temporal sobrevive.
         WITH victims AS (
           SELECT t.id
           FROM execution_order_status_transitions t
           JOIN execution_orders o
             ON o.id = t.execution_order_id
            AND o.tenant_id = t.tenant_id
           WHERE t.changed_by IS NOT NULL
             AND t.changed_by <> '${TRANSITION_RETENTION_ANONYMIZED_SENTINEL}'::uuid
             AND o.status IN (${TERMINAL_STATUSES_SQL})
             AND COALESCE(
               (
                 SELECT MAX(s.changed_at)
                 FROM execution_order_status_transitions s
                 WHERE s.execution_order_id = o.id
                   AND s.tenant_id = o.tenant_id
                   AND s.to_status IN (${TERMINAL_STATUSES_SQL})
                   AND s.correction_of_id IS NULL
               ),
               o.closed_at
             ) <= NOW() - INTERVAL '24 months'
           ORDER BY t.changed_at, t.id
           LIMIT batch_size
         )
         UPDATE execution_order_status_transitions target
         SET changed_by = '${TRANSITION_RETENTION_ANONYMIZED_SENTINEL}'::uuid,
             reason = NULL
         USING victims
         WHERE target.id = victims.id;
         GET DIAGNOSTICS deleted_count = ROW_COUNT;
         transitions_anonymized := deleted_count;

         RETURN QUERY SELECT idempotency_deleted, outbox_deleted, inbox_deleted,
           audit_deleted, evidence_deleted, transitions_anonymized;
       END
       $function$`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // La columna solo puede volver a NOT NULL si ninguna fila usa el NULL
    // reservado a «nunca se registró»: inventar actores para tapar el hueco
    // violaría el dictamen. Se verifica ANTES de emitir DDL para no dejar la
    // reversión a medias. (El centinela es NOT NULL y nunca bloquea.)
    const nullRows = ((await queryRunner.query(
      `SELECT COUNT(*)::int AS total FROM execution_order_status_transitions WHERE changed_by IS NULL`,
    )) ?? []) as Array<{ total: number }>;
    const nullTotal = nullRows[0]?.total ?? 0;
    if (nullTotal > 0) {
      throw new Error(
        `Rollback de AnonymizeExecutionOrderTransitionRetention bloqueado: ` +
          `${nullTotal} asiento(s) con changed_by NULL («nunca se registró», CA-07). ` +
          `Restaurar NOT NULL exigiría inventar actores. Resuelva esas filas de ` +
          `forma explícita antes de revertir.`,
      );
    }

    // Restaura el literal exacto de la 101 (los datos anonimizados NO se
    // recuperan: la anonimización es irreversible por diseño, CA-05).
    await queryRunner.query(PRE_134_PURGE_FUNCTION_SQL);
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_execution_order_status_transitions_retention`,
    );
    await queryRunner.query(`
      ALTER TABLE execution_order_status_transitions
        ALTER COLUMN changed_by SET NOT NULL
    `);
  }
}
