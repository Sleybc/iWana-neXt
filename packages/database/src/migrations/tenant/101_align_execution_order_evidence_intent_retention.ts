import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SQL literal de la función creada por la migración 095. Se conserva como
 * constante para que `down()` la restaure EXACTA (misma firma, mismo cuerpo):
 * una migración es una foto inmutable y revertir la 101 debe dejar el schema
 * como lo dejó la 095, incluido su bug de retención (el historial no se
 * reescribe).
 */
const LEGACY_PURGE_FUNCTION_SQL = `
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
           SELECT id FROM execution_order_evidence_upload_intents
           WHERE expires_at IS NOT NULL
             AND expires_at <= NOW()
           ORDER BY expires_at, id
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
 * Migración 101: retención durable de evidencia de OT.
 *
 * Corrige el bug de retención de la 095: la purga borraba intents expirados
 * sin importar si un registro de idempotencia VIVO los referenciaba
 * (`resource_ref` legacy o `evidence_upload_intent_id` tras la 100). El
 * replay posterior encontraba el intent borrado y respondía 409
 * `EVIDENCE_UPLOAD_IN_PROGRESS` permanente hasta la expiración del registro
 * (90 días).
 *
 * Nueva semántica del paso de evidencia (misma firma, mismo caller):
 *   1. Purga solo intents EXPIRADOS que ningún registro de idempotencia
 *      referencie por `evidence_upload_intent_id`.
 *   2. Retiene intents vinculados mientras el registro exista (vivo: no
 *      tombstoned, no vencido — horizonte de idempotencia).
 *   3. Un registro vencido/tombstoned se purga primero (paso de idempotencia,
 *      que corre ANTES en esta misma función con su propia regla de retención
 *      de 90 días para PENDING); al desaparecer, el intent queda libre y se
 *      purga en el mismo lote o en el siguiente.
 *
 * El `NOT EXISTS` excluye CUALQUIER registro existente, no solo los vivos:
 * la FK es `ON DELETE RESTRICT` (100) y borrar un intent aún referenciado
 * rompería la función con 23503. Un registro vencido pero retenido por la
 * regla PENDING/90 días sigue siendo dueño de la referencia hasta que se
 * purgue él mismo.
 *
 * NO se toca el CHECK de estados: la migración 099 ya lo amplió a los seis
 * estados de la entidad (`PENDING`, `PENDING_ANALYSIS`, `AVAILABLE`,
 * `REJECTED`, `EXPIRED`, `FAILED`); la 095 y la 099 quedan intactas.
 *
 * Schema: tenant
 * Reversible: sí (down restaura el literal EXACTO de la 095)
 */
export class AlignExecutionOrderEvidenceIntentRetention1010000000000 implements MigrationInterface {
  name = 'AlignExecutionOrderEvidenceIntentRetention1010000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
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
       $function$`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restaura el literal exacto de la 095: el schema vuelve al estado
    // histórico, incluida la purga sin consciencia de idempotencia.
    await queryRunner.query(LEGACY_PURGE_FUNCTION_SQL);
  }
}
