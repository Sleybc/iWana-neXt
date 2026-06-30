'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.AddAdditionalServiceIdsToExpediente1700000000027 = void 0;
/**
 * Migración 027: Agrega additional_service_ids a expediente_records.
 *
 * up():
 *   - Agrega columna `additional_service_ids` JSONB con default `[]` en expediente_records.
 *     Almacena los IDs de servicios adicionales del catálogo seleccionados para el expediente.
 *     Espeja la columna existing `additional_product_ids` — mismo patrón.
 *
 * down() (reversible):
 *   - Elimina la columna `additional_service_ids` de expediente_records.
 */
class AddAdditionalServiceIdsToExpediente1700000000027 {
  name = 'AddAdditionalServiceIdsToExpediente1700000000027';
  async up(queryRunner) {
    await queryRunner.query(`
      ALTER TABLE expediente_records
      ADD COLUMN IF NOT EXISTS additional_service_ids JSONB NOT NULL DEFAULT '[]'::jsonb
    `);
  }
  async down(queryRunner) {
    await queryRunner.query(`
      ALTER TABLE expediente_records
      DROP COLUMN IF EXISTS additional_service_ids
    `);
  }
}
exports.AddAdditionalServiceIdsToExpediente1700000000027 =
  AddAdditionalServiceIdsToExpediente1700000000027;
//# sourceMappingURL=027_add_additional_service_ids_to_expediente.js.map
