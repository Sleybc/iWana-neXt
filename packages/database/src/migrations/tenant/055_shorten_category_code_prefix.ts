import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migracion 055: acorta code_prefix a 2-3 caracteres para habilitar SKU compuesto.
 *
 * No recalcula SKUs existentes; solo acorta el prefijo usado por nuevas emisiones.
 */
export class ShortenCategoryCodePrefix0550000000000 implements MigrationInterface {
  name = 'ShortenCategoryCodePrefix0550000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE inventory_categories AS cat
      SET code_prefix = CASE
        WHEN cat.code IN ('CONSUMIBLEFO', 'CONSUMIBLESFO') OR cat.code_prefix IN ('CONSFO', 'CONSUMIB') THEN 'CFO'
        WHEN cat.code = 'CONSUMIBLESRD' OR cat.code_prefix IN ('CONSRD', 'CONSUMI2') THEN 'CRD'
        WHEN LENGTH(cat.code_prefix) > 3 THEN LEFT(cat.code_prefix, 3)
        ELSE cat.code_prefix
      END
      WHERE LENGTH(cat.code_prefix) > 3
    `);

    await queryRunner.query(`
      ALTER TABLE inventory_categories
        ALTER COLUMN code_prefix TYPE VARCHAR(3)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE inventory_categories
        ALTER COLUMN code_prefix TYPE VARCHAR(8)
    `);

    await queryRunner.query(`
      UPDATE inventory_categories AS cat
      SET code_prefix = CASE
        WHEN cat.code_prefix = 'CFO' THEN 'CONSFO'
        WHEN cat.code_prefix = 'CRD' THEN 'CONSRD'
        ELSE cat.code_prefix
      END
      WHERE cat.code_prefix IN ('CFO', 'CRD')
    `);
  }
}
