import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExpedienteTechnicalViabilityFields1700000000006 implements MigrationInterface {
  name = 'AddExpedienteTechnicalViabilityFields1700000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE expediente_records
      ADD COLUMN IF NOT EXISTS candidate_technologies JSONB,
      ADD COLUMN IF NOT EXISTS technical_confidence VARCHAR(20),
      ADD COLUMN IF NOT EXISTS evaluation_source VARCHAR(30)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE expediente_records
      DROP COLUMN IF EXISTS evaluation_source,
      DROP COLUMN IF EXISTS technical_confidence,
      DROP COLUMN IF EXISTS candidate_technologies
    `);
  }
}