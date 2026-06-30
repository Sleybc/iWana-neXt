import { MigrationInterface, QueryRunner } from 'typeorm';

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
export class AddAdditionalServiceIdsToExpediente1700000000027 implements MigrationInterface {
  name = 'AddAdditionalServiceIdsToExpediente1700000000027';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE expediente_records
      ADD COLUMN IF NOT EXISTS additional_service_ids JSONB NOT NULL DEFAULT '[]'::jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE expediente_records
      DROP COLUMN IF EXISTS additional_service_ids
    `);
  }
}
