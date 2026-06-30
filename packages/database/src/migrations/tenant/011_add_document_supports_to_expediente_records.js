'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.AddDocumentSupportsToExpedienteRecords1700000000011 = void 0;
class AddDocumentSupportsToExpedienteRecords1700000000011 {
  name = 'AddDocumentSupportsToExpedienteRecords1700000000011';
  async up(queryRunner) {
    await queryRunner.query(`
      ALTER TABLE expediente_records
      ADD COLUMN IF NOT EXISTS document_supports JSONB NULL DEFAULT '{}'::jsonb
    `);
  }
  async down(queryRunner) {
    await queryRunner.query(`
      ALTER TABLE expediente_records
      DROP COLUMN IF EXISTS document_supports
    `);
  }
}
exports.AddDocumentSupportsToExpedienteRecords1700000000011 =
  AddDocumentSupportsToExpedienteRecords1700000000011;
//# sourceMappingURL=011_add_document_supports_to_expediente_records.js.map
