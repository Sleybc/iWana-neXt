import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migracion 054: corrige prefijos truncados a formato legible (base + distintivo).
 *
 * Solo aplica a categorias sin productos asociados, porque code_prefix es inmutable
 * tras emitir SKUs. Mapea prefijos legacy CONSUMIB/CONSUMI2 -> CONSFO/CONSRD.
 */
export class RepairCategoryCodePrefixLegible0540000000000 implements MigrationInterface {
  name = 'RepairCategoryCodePrefixLegible0540000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      WITH safe_categories AS (
        SELECT cat.id
        FROM inventory_categories AS cat
        LEFT JOIN inventory_items AS item
          ON item.category_id = cat.id
          AND item.tenant_id = cat.tenant_id
        GROUP BY cat.id
        HAVING COUNT(item.id) = 0
      )
      UPDATE inventory_categories AS cat
      SET code_prefix = CASE
        WHEN cat.code = 'CONSUMIBLESRD' OR cat.code_prefix = 'CONSUMI2' THEN 'CONSRD'
        WHEN cat.code = 'CONSUMIBLEFO' OR cat.code_prefix = 'CONSUMIB' THEN 'CONSFO'
        ELSE cat.code_prefix
      END
      WHERE cat.id IN (SELECT id FROM safe_categories)
        AND (
          cat.code IN ('CONSUMIBLEFO', 'CONSUMIBLESRD')
          OR cat.code_prefix IN ('CONSUMIB', 'CONSUMI2')
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      WITH safe_categories AS (
        SELECT cat.id
        FROM inventory_categories AS cat
        LEFT JOIN inventory_items AS item
          ON item.category_id = cat.id
          AND item.tenant_id = cat.tenant_id
        GROUP BY cat.id
        HAVING COUNT(item.id) = 0
      )
      UPDATE inventory_categories AS cat
      SET code_prefix = CASE
        WHEN cat.code_prefix = 'CONSRD' THEN 'CONSUMI2'
        WHEN cat.code_prefix = 'CONSFO' THEN 'CONSUMIB'
        ELSE cat.code_prefix
      END
      WHERE cat.id IN (SELECT id FROM safe_categories)
        AND cat.code_prefix IN ('CONSRD', 'CONSFO')
    `);
  }
}
