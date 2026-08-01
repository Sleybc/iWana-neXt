import { MigrationInterface, QueryRunner } from 'typeorm';

const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

/**
 * Migración 100: relación autoritativa entre idempotencia y evidencia.
 *
 * ADR-068: MOD11 conserva el intento de upload en el schema del tenant. Hasta
 * ahora la única referencia del registro de idempotencia al intent era
 * `resource_ref` (varchar genérico). Esta migración añade la columna tipada
 * `evidence_upload_intent_id` con FK `ON DELETE RESTRICT`, que vuelve la
 * relación explícita y permite a la purga de retención distinguir intents
 * vinculados a idempotencia vigente (la 101 consume esta columna).
 *
 * - `resource_ref` se conserva intacto: sigue siendo la referencia genérica.
 * - El backfill resuelve SOLO referencias legacy válidas: `resource_ref` con
 *   forma de UUID y un intent existente con ese id en el MISMO schema. Un
 *   intent ya expirado pero aún presente también se vincula: el replay del
 *   cliente depende de que la evidencia no desaparezca mientras el registro
 *   de idempotencia siga vivo.
 *
 * Schema: tenant
 * Reversible: sí (down exige el flag destructivo si hay vínculos poblados)
 */
export class LinkExecutionOrderEvidenceIdempotency1000000000000 implements MigrationInterface {
  name = 'LinkExecutionOrderEvidenceIdempotency1000000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE execution_order_idempotency_records
        ADD COLUMN IF NOT EXISTS evidence_upload_intent_id UUID
    `);

    await queryRunner.query(`
      ALTER TABLE execution_order_idempotency_records
        DROP CONSTRAINT IF EXISTS fk_execution_order_idempotency_evidence_intent
    `);

    await queryRunner.query(`
      ALTER TABLE execution_order_idempotency_records
        ADD CONSTRAINT fk_execution_order_idempotency_evidence_intent
        FOREIGN KEY (evidence_upload_intent_id)
        REFERENCES execution_order_evidence_upload_intents (id)
        ON DELETE RESTRICT
    `);

    // Índice parcial: soporta el NOT EXISTS de la purga (101) y el barrido
    // por FK sin indexar los NULL que dominan la tabla.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_execution_order_idempotency_evidence_intent
        ON execution_order_idempotency_records (evidence_upload_intent_id)
        WHERE evidence_upload_intent_id IS NOT NULL
    `);

    // Backfill legacy. El join con el cast de uuid a texto ya exige que
    // `resource_ref` tenga forma de UUID; el regex lo declara explícito y
    // `lower()` tolera mayúsculas en la referencia histórica.
    await queryRunner.query(`
      UPDATE execution_order_idempotency_records target
      SET evidence_upload_intent_id = intents.id
      FROM execution_order_evidence_upload_intents intents
      WHERE target.evidence_upload_intent_id IS NULL
        AND target.resource_ref ~
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        AND lower(target.resource_ref) = intents.id::text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Soltar la columna pierde los vínculos backfilleados: exige intención
    // explícita, igual que 096 con captured_at.
    if (process.env[DESTRUCTIVE_DOWN_ENV_VAR] !== 'true') {
      const rows = ((await queryRunner.query(
        `SELECT COUNT(*)::int AS total
         FROM execution_order_idempotency_records
         WHERE evidence_upload_intent_id IS NOT NULL`,
      )) ?? []) as Array<{ total: number }>;
      const total = rows[0]?.total ?? 0;
      if (total > 0) {
        throw new Error(
          `Rollback de LinkExecutionOrderEvidenceIdempotency bloqueado: ` +
            `${total} registro(s) mantienen vínculo de evidencia. ` +
            `Para continuar de forma destructiva, ` +
            `exporte ${DESTRUCTIVE_DOWN_ENV_VAR}=true de forma explícita.`,
        );
      }
    }

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_execution_order_idempotency_evidence_intent
    `);
    await queryRunner.query(`
      ALTER TABLE execution_order_idempotency_records
        DROP CONSTRAINT IF EXISTS fk_execution_order_idempotency_evidence_intent
    `);
    await queryRunner.query(`
      ALTER TABLE execution_order_idempotency_records
        DROP COLUMN IF EXISTS evidence_upload_intent_id
    `);
  }
}
