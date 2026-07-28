import { MigrationInterface, QueryRunner } from 'typeorm';

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

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_execution_order_evidence_upload_intents_order
       ON execution_order_evidence_upload_intents (execution_order_id, created_at)`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_execution_order_evidence_upload_intents_media_asset
       ON execution_order_evidence_upload_intents (tenant_id, media_asset_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_execution_order_evidence_upload_intents_media_asset`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_execution_order_evidence_upload_intents_order`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS execution_order_evidence_upload_intents`);
  }
}
