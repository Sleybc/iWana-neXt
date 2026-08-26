import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 116 — agrega `customer_segment` a `expediente_records` para
 * capturar el tipo de cliente (Residencial, SOHO, PyME, Gobierno,
 * Corporativo, Mayorista) desde el alta de la oportunidad.
 *
 * Reutiliza el enum `customer_segment_enum` creado en la migración 012
 * (subscribers). La columna es nullable para no romper expedientes
 * históricos; la obligatoriedad se fuerza a nivel DTO en el alta.
 * Base conceptual: ADR-025 (segmento como dimensión de negocio).
 *
 * Schema: tenant (search_path). Reversible: sí.
 */
export class AddCustomerSegmentToExpedienteRecords1160000000000 implements MigrationInterface {
  name = 'AddCustomerSegmentToExpedienteRecords1160000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE expediente_records
      ADD COLUMN IF NOT EXISTS customer_segment customer_segment_enum NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE expediente_records
      DROP COLUMN IF EXISTS customer_segment
    `);
  }
}
