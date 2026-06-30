'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.AddExpedienteTechnicalViabilityFields1700000000006 = void 0;
class AddExpedienteTechnicalViabilityFields1700000000006 {
  name = 'AddExpedienteTechnicalViabilityFields1700000000006';
  async up(queryRunner) {
    await queryRunner.query(`
      ALTER TABLE expediente_records
      ADD COLUMN IF NOT EXISTS candidate_technologies JSONB,
      ADD COLUMN IF NOT EXISTS technical_confidence VARCHAR(20),
      ADD COLUMN IF NOT EXISTS evaluation_source VARCHAR(30)
    `);
  }
  async down(queryRunner) {
    await queryRunner.query(`
      ALTER TABLE expediente_records
      DROP COLUMN IF EXISTS evaluation_source,
      DROP COLUMN IF EXISTS technical_confidence,
      DROP COLUMN IF EXISTS candidate_technologies
    `);
  }
}
exports.AddExpedienteTechnicalViabilityFields1700000000006 =
  AddExpedienteTechnicalViabilityFields1700000000006;
//# sourceMappingURL=006_add_expediente_technical_viability_fields.js.map
