import { MigrationInterface, QueryRunner } from 'typeorm';

const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

/**
 * Migración 095: tabla durable de intents de upload de evidencia.
 *
 * ADR-068: MOD11 conserva el intento de upload en el schema del tenant;
 * Media/Assets conserva el binario y metadata técnica en public.media_assets.
 *
 * Schema: tenant
 * Reversible: sí
 */
export class CreateExecutionOrderEvidenceUploadIntents0950000000000 implements MigrationInterface {
  name = 'CreateExecutionOrderEvidenceUploadIntents0950000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS execution_order_evidence_upload_intents (
        id                  UUID        NOT NULL DEFAULT gen_random_uuid(),
        execution_order_id  UUID        NOT NULL,
        tenant_id           UUID        NOT NULL,
        media_asset_id      UUID,
        status              VARCHAR(32) NOT NULL DEFAULT 'PENDING_ANALYSIS',
        expires_at          TIMESTAMPTZ,
        actor_user_id       UUID,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_execution_order_evidence_upload_intents PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
      DO $migration$
      BEGIN
        ALTER TABLE execution_order_evidence_upload_intents
          ADD CONSTRAINT chk_execution_order_evidence_upload_intents_status
          CHECK (status IN ('PENDING_ANALYSIS', 'AVAILABLE', 'REJECTED', 'EXPIRED'));
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END
      $migration$
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_execution_order_evidence_upload_intents_order
       ON execution_order_evidence_upload_intents (execution_order_id, created_at)`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_execution_order_evidence_upload_intents_media_asset
       ON execution_order_evidence_upload_intents (tenant_id, media_asset_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_execution_order_evidence_upload_intents_retention
       ON execution_order_evidence_upload_intents (expires_at, id)
       WHERE expires_at IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE OR REPLACE FUNCTION purge_execution_order_retention_batch(batch_size INTEGER DEFAULT 500)
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
       $function$`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (process.env[DESTRUCTIVE_DOWN_ENV_VAR] !== 'true') {
      const rows = ((await queryRunner.query(
        `SELECT COUNT(*)::int AS total FROM execution_order_evidence_upload_intents`,
      )) ?? []) as Array<{ total: number }>;
      const total = rows[0]?.total ?? 0;
      if (total > 0) {
        throw new Error(
          `Rollback de CreateExecutionOrderEvidenceUploadIntents bloqueado: ` +
            `la tabla contiene ${total} intent(s). Para continuar de forma destructiva, ` +
            `exporte ${DESTRUCTIVE_DOWN_ENV_VAR}=true de forma explícita.`,
        );
      }
    }

    await queryRunner.query(
      `DROP FUNCTION IF EXISTS purge_execution_order_retention_batch(INTEGER)`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_execution_order_evidence_upload_intents_retention`,
    );
    await queryRunner.query(
      `ALTER TABLE execution_order_evidence_upload_intents
       DROP CONSTRAINT IF EXISTS chk_execution_order_evidence_upload_intents_status`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_execution_order_evidence_upload_intents_media_asset`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_execution_order_evidence_upload_intents_order`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS execution_order_evidence_upload_intents`);
  }
}
