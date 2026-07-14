import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPartyCityDepartment0660000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE party
        ADD COLUMN IF NOT EXISTS city       VARCHAR(120),
        ADD COLUMN IF NOT EXISTS department VARCHAR(120)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE party
        DROP COLUMN IF EXISTS department,
        DROP COLUMN IF EXISTS city
    `);
  }
}
