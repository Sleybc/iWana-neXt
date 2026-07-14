import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPartyAddressFields0650000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE party
        ADD COLUMN IF NOT EXISTS address   VARCHAR(255),
        ADD COLUMN IF NOT EXISTS latitude  NUMERIC(10, 7),
        ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE party
        DROP COLUMN IF EXISTS longitude,
        DROP COLUMN IF EXISTS latitude,
        DROP COLUMN IF EXISTS address
    `);
  }
}
