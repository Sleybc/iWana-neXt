import { MigrationInterface, QueryRunner } from 'typeorm';

const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

/**
 * Migración 190 — huella del contenido de la plantilla congelada en la generación del
 * contrato (cierre de venta; hallazgos SEC-2/SEC-4 sobre ADR-109 D4/D5).
 *
 * Schema tenant. `contract_document_generations.template_sha256`: SHA-256 del contenido del
 * texto legal CONTRATO_SERVICIO publicado (id y versión ya congelados en la fila). El worker
 * renderiza ese contenido, leído por id y versión, solo si su huella coincide; la firma lo
 * re-renderiza con la misma huella. Las filas anteriores quedan en NULL y el worker no las
 * renderiza (fallan cerradas).
 *
 * `down()` retira la columna. Si alguna fila la tiene escrita lo bloquea salvo
 * `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true`: sin la huella esas generaciones no se re-renderizan.
 */
export class ContractTemplateContentHash1900000000190 implements MigrationInterface {
  name = 'ContractTemplateContentHash1900000000190';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE contract_document_generations
        ADD COLUMN IF NOT EXISTS template_sha256 char(64) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE contract_document_generations
        DROP CONSTRAINT IF EXISTS chk_cdg_template_sha256
    `);
    await queryRunner.query(`
      ALTER TABLE contract_document_generations
        ADD CONSTRAINT chk_cdg_template_sha256
          CHECK (template_sha256 IS NULL OR template_sha256 ~ '^[0-9a-f]{64}$')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (process.env[DESTRUCTIVE_DOWN_ENV_VAR] !== 'true') {
      const rows = (await queryRunner.query(`
        SELECT COUNT(*)::int AS total FROM contract_document_generations
         WHERE template_sha256 IS NOT NULL
      `)) as Array<{ total: number }>;
      const total = rows[0]?.total ?? 0;
      if (total > 0) {
        throw new Error(
          `Rollback de ContractTemplateContentHash bloqueado: ${total} generación(es) con huella ` +
            `de plantilla. Para continuar de forma destructiva, exporte ${DESTRUCTIVE_DOWN_ENV_VAR}=true.`,
        );
      }
    }
    await queryRunner.query(`
      ALTER TABLE contract_document_generations DROP CONSTRAINT IF EXISTS chk_cdg_template_sha256
    `);
    await queryRunner.query(`
      ALTER TABLE contract_document_generations DROP COLUMN IF EXISTS template_sha256
    `);
  }
}
