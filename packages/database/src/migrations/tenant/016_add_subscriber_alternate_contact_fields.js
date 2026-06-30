'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.AddSubscriberAlternateContactFields1700000000016 = void 0;
/**
 * Migración 016: añade contacto alternativo en subscribers.
 * - alt_contact_name: nombre de contacto alternativo
 * - alt_contact_phone_encrypted: teléfono alternativo cifrado
 */
class AddSubscriberAlternateContactFields1700000000016 {
  name = 'AddSubscriberAlternateContactFields1700000000016';
  async up(queryRunner) {
    await queryRunner.query(`
      ALTER TABLE subscribers
      ADD COLUMN IF NOT EXISTS alt_contact_name VARCHAR(160) NULL,
      ADD COLUMN IF NOT EXISTS alt_contact_phone_encrypted VARCHAR(100) NULL
    `);
  }
  async down(queryRunner) {
    await queryRunner.query(`
      ALTER TABLE subscribers
      DROP COLUMN IF EXISTS alt_contact_phone_encrypted,
      DROP COLUMN IF EXISTS alt_contact_name
    `);
  }
}
exports.AddSubscriberAlternateContactFields1700000000016 =
  AddSubscriberAlternateContactFields1700000000016;
//# sourceMappingURL=016_add_subscriber_alternate_contact_fields.js.map
