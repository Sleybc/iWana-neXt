import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 016: añade contacto alternativo en subscribers.
 * - alt_contact_name: nombre de contacto alternativo
 * - alt_contact_phone_encrypted: teléfono alternativo cifrado
 */
export class AddSubscriberAlternateContactFields1700000000016 implements MigrationInterface {
  name = 'AddSubscriberAlternateContactFields1700000000016';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE subscribers
      ADD COLUMN IF NOT EXISTS alt_contact_name VARCHAR(160) NULL,
      ADD COLUMN IF NOT EXISTS alt_contact_phone_encrypted VARCHAR(100) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE subscribers
      DROP COLUMN IF EXISTS alt_contact_phone_encrypted,
      DROP COLUMN IF EXISTS alt_contact_name
    `);
  }
}
