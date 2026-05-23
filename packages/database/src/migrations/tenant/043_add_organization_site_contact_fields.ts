import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrganizationSiteContactFields1748698800043 implements MigrationInterface {
  name = 'AddOrganizationSiteContactFields1748698800043';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE organization_sites
        ADD COLUMN IF NOT EXISTS contact_name varchar(160),
        ADD COLUMN IF NOT EXISTS contact_phone varchar(32)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE organization_sites
        DROP COLUMN IF EXISTS contact_phone,
        DROP COLUMN IF EXISTS contact_name
    `);
  }
}
