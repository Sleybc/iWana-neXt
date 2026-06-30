'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.AddOrganizationSiteContactFields1748698800043 = void 0;
class AddOrganizationSiteContactFields1748698800043 {
  name = 'AddOrganizationSiteContactFields1748698800043';
  async up(queryRunner) {
    await queryRunner.query(`
      ALTER TABLE organization_sites
        ADD COLUMN IF NOT EXISTS contact_name varchar(160),
        ADD COLUMN IF NOT EXISTS contact_phone varchar(32)
    `);
  }
  async down(queryRunner) {
    await queryRunner.query(`
      ALTER TABLE organization_sites
        DROP COLUMN IF EXISTS contact_phone,
        DROP COLUMN IF EXISTS contact_name
    `);
  }
}
exports.AddOrganizationSiteContactFields1748698800043 =
  AddOrganizationSiteContactFields1748698800043;
//# sourceMappingURL=043_add_organization_site_contact_fields.js.map
