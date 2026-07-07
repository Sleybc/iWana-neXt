import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migracion 053: prefijo corto de SKU en categorias de inventario.
 *
 * Anade code_prefix varchar(8) a inventory_categories, lo backfill-ea desde
 * el code existente (sanitizado, mayusculas, alfanumerico, max 8) con
 * desduplicacion por tenant, y crea un indice unico (tenant_id, code_prefix).
 *
 * El prefijo es la base para la generacion automatica de SKU de productos en
 * formato {CODE_PREFIX}-{NNNNNN} y es inmutable tras la creacion de la
 * categoria para no romper SKUs ya emitidos.
 */
export class AddCategoryCodePrefix0530000000000 implements MigrationInterface {
  name = 'AddCategoryCodePrefix0530000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE inventory_categories
        ADD COLUMN code_prefix VARCHAR(8)
    `);

    await queryRunner.query(`
      UPDATE inventory_categories
      SET code_prefix = COALESCE(
        NULLIF(
          UPPER(REGEXP_REPLACE(SUBSTRING(code FROM 1 FOR 8), '[^A-Z0-9]', '', 'g')),
          ''
        ),
        'CAT'
      )
    `);

    await queryRunner.query(`
      WITH duplicates AS (
        SELECT
          id,
          code_prefix,
          ROW_NUMBER() OVER (
            PARTITION BY tenant_id, code_prefix
            ORDER BY created_at ASC, id ASC
          ) AS rn
        FROM inventory_categories
      )
      UPDATE inventory_categories AS cat
      SET code_prefix =
        LEFT(d.code_prefix, GREATEST(1, 8 - LENGTH(d.rn::text))) || d.rn::text
      FROM duplicates AS d
      WHERE cat.id = d.id AND d.rn > 1
    `);

    await queryRunner.query(`
      ALTER TABLE inventory_categories
        ALTER COLUMN code_prefix SET NOT NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_inventory_categories_tenant_code_prefix
        ON inventory_categories (tenant_id, code_prefix)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS uq_inventory_categories_tenant_code_prefix
    `);

    await queryRunner.query(`
      ALTER TABLE inventory_categories
        DROP COLUMN IF EXISTS code_prefix
    `);
  }
}
