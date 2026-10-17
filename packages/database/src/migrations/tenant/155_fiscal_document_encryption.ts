import { MigrationInterface, QueryRunner } from 'typeorm';

const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

/**
 * Migración 155: expande contrato y expediente para cifrar el documento fiscal.
 * `down()` exige autorización explícita si ya hay ciphertext o HMAC almacenados.
 */
export class FiscalDocumentEncryption1550000000000 implements MigrationInterface {
  name = 'FiscalDocumentEncryption1550000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE contracts
        ADD COLUMN fiscal_document_encrypted varchar(500),
        ADD COLUMN fiscal_document_hmac varchar(64)
    `);
    await queryRunner.query(`
      ALTER TABLE expediente_records
        ADD COLUMN fiscal_document_encrypted varchar(500),
        ADD COLUMN fiscal_document_hmac varchar(64)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_contracts_fiscal_document_hmac
        ON contracts (fiscal_document_hmac)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_expediente_records_fiscal_document_hmac
        ON expediente_records (fiscal_document_hmac)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (process.env[DESTRUCTIVE_DOWN_ENV_VAR] !== 'true') {
      const populatedRows = (await queryRunner.query(`
        SELECT
          (SELECT COUNT(*)::int FROM contracts
            WHERE fiscal_document_encrypted IS NOT NULL OR fiscal_document_hmac IS NOT NULL) AS contracts_count,
          (SELECT COUNT(*)::int FROM expediente_records
            WHERE fiscal_document_encrypted IS NOT NULL OR fiscal_document_hmac IS NOT NULL) AS expedientes_count
      `)) as Array<{ contracts_count: number; expedientes_count: number }>;
      const contractsCount = populatedRows[0]?.contracts_count ?? 0;
      const expedientesCount = populatedRows[0]?.expedientes_count ?? 0;
      if (contractsCount > 0 || expedientesCount > 0) {
        throw new Error(
          `Rollback de FiscalDocumentEncryption bloqueado: contratos=${contractsCount}, expedientes=${expedientesCount} conservan ciphertext o HMAC. Para continuar de forma destructiva, exporte ${DESTRUCTIVE_DOWN_ENV_VAR}=true de forma explícita.`,
        );
      }
    }

    await queryRunner.query(`DROP INDEX IF EXISTS idx_expediente_records_fiscal_document_hmac`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_contracts_fiscal_document_hmac`);
    await queryRunner.query(`
      ALTER TABLE expediente_records
        DROP COLUMN IF EXISTS fiscal_document_hmac,
        DROP COLUMN IF EXISTS fiscal_document_encrypted
    `);
    await queryRunner.query(`
      ALTER TABLE contracts
        DROP COLUMN IF EXISTS fiscal_document_hmac,
        DROP COLUMN IF EXISTS fiscal_document_encrypted
    `);
  }
}
