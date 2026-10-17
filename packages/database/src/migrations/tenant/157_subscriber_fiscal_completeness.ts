import { MigrationInterface, QueryRunner } from 'typeorm';

/** Migración 157: permite prospectos incompletos y exige completitud al activar. */
export class SubscriberFiscalCompleteness1570000000000 implements MigrationInterface {
  name = 'SubscriberFiscalCompleteness1570000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE subscribers
        ALTER COLUMN vat_responsibility DROP NOT NULL,
        DROP CONSTRAINT IF EXISTS ck_subscribers_juridica_legal_representative
    `);
    await queryRunner.query(`
      ALTER TABLE subscribers
        ADD CONSTRAINT ck_subscribers_fiscal_complete_when_active
        CHECK (
          status IN ('LEAD', 'PROSPECT', 'CANCELLED')
          OR (
            vat_responsibility IS NOT NULL
            AND (person_type <> 'JURIDICA' OR legal_representative_party_id IS NOT NULL)
          )
        ) NOT VALID
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const missingVatRows = (await queryRunner.query(`
      SELECT COUNT(*)::int AS missing_vat_count
        FROM subscribers
       WHERE vat_responsibility IS NULL
    `)) as Array<{ missing_vat_count: number }>;
    const missingVatCount = missingVatRows[0]?.missing_vat_count ?? 0;
    console.info(`[157] vat_responsibility NULL: ${missingVatCount}`);

    if (missingVatCount > 0) {
      throw new Error(
        `Migración 157 down abortada: ${missingVatCount} suscriptores no tienen vat_responsibility; resolver antes de revertir.`,
      );
    }

    await queryRunner.query(`
      ALTER TABLE subscribers
        DROP CONSTRAINT IF EXISTS ck_subscribers_fiscal_complete_when_active,
        ADD CONSTRAINT ck_subscribers_juridica_legal_representative
          CHECK (person_type <> 'JURIDICA' OR legal_representative_party_id IS NOT NULL) NOT VALID,
        ALTER COLUMN vat_responsibility SET NOT NULL
    `);
  }
}
