'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.AddPostalCodeToExpedienteRecords1700000000010 = void 0;
class AddPostalCodeToExpedienteRecords1700000000010 {
  name = 'AddPostalCodeToExpedienteRecords1700000000010';
  async up(queryRunner) {
    await queryRunner.query(`
      ALTER TABLE expediente_records
      ADD COLUMN IF NOT EXISTS postal_code VARCHAR(12) NULL
    `);
  }
  async down(queryRunner) {
    await queryRunner.query(`
      ALTER TABLE expediente_records
      DROP COLUMN IF EXISTS postal_code
    `);
  }
}
exports.AddPostalCodeToExpedienteRecords1700000000010 =
  AddPostalCodeToExpedienteRecords1700000000010;
//# sourceMappingURL=010_add_postal_code_to_expediente_records.js.map
