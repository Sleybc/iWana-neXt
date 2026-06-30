import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDocumentSupportsToExpedienteRecords1700000000011 implements MigrationInterface {
  name = 'AddDocumentSupportsToExpedienteRecords1700000000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE expediente_records
      ADD COLUMN IF NOT EXISTS document_supports JSONB NULL DEFAULT '{}'::jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE expediente_records
      DROP COLUMN IF EXISTS document_supports
    `);
  }
}