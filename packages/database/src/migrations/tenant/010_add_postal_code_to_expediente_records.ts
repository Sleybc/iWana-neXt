import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPostalCodeToExpedienteRecords1700000000010 implements MigrationInterface {
  name = 'AddPostalCodeToExpedienteRecords1700000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE expediente_records
      ADD COLUMN IF NOT EXISTS postal_code VARCHAR(12) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE expediente_records
      DROP COLUMN IF EXISTS postal_code
    `);
  }
}
