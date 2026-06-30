'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.CreateInventoryCategories0520000000000 = void 0;
/**
 * Migracion 052: categorias administrables de inventario y enlace en inventory_items.
 */
class CreateInventoryCategories0520000000000 {
  name = 'CreateInventoryCategories0520000000000';
  async up(queryRunner) {
    await queryRunner.query(`
      CREATE TYPE inventory_category_status AS ENUM (
        'ACTIVE',
        'INACTIVE'
      )
    `);
    await queryRunner.query(`
      CREATE TABLE inventory_categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        code VARCHAR(80) NOT NULL,
        name VARCHAR(160) NOT NULL,
        description TEXT,
        status inventory_category_status NOT NULL DEFAULT 'ACTIVE',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_inventory_categories_tenant_code UNIQUE (tenant_id, code)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_inventory_categories_tenant_status_sort
        ON inventory_categories (tenant_id, status, sort_order)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_inventory_categories_tenant_name_lower
        ON inventory_categories (tenant_id, lower(name))
    `);
    await queryRunner.query(`
      INSERT INTO inventory_categories (
        id,
        tenant_id,
        code,
        name,
        description,
        status,
        sort_order,
        created_at,
        updated_at
      )
      SELECT
        gen_random_uuid(),
        distinct_items.tenant_id,
        distinct_items.category::text,
        CASE distinct_items.category::text
          WHEN 'CPE' THEN 'CPE'
          WHEN 'NETWORKING' THEN 'Networking'
          WHEN 'MATERIALS' THEN 'Materiales'
          WHEN 'TOOLS' THEN 'Herramientas'
          WHEN 'CONSUMABLES' THEN 'Consumibles'
          WHEN 'OTHER' THEN 'Otro'
        END,
        NULL,
        'ACTIVE',
        CASE distinct_items.category::text
          WHEN 'CPE' THEN 0
          WHEN 'NETWORKING' THEN 1
          WHEN 'MATERIALS' THEN 2
          WHEN 'TOOLS' THEN 3
          WHEN 'CONSUMABLES' THEN 4
          WHEN 'OTHER' THEN 5
        END,
        NOW(),
        NOW()
      FROM (
        SELECT DISTINCT tenant_id, category
        FROM inventory_items
      ) AS distinct_items
    `);
    await queryRunner.query(`
      ALTER TABLE inventory_items
        ADD COLUMN category_id UUID
    `);
    await queryRunner.query(`
      UPDATE inventory_items AS item
      SET category_id = category_row.id
      FROM inventory_categories AS category_row
      WHERE item.tenant_id = category_row.tenant_id
        AND item.category::text = category_row.code
    `);
    await queryRunner.query(`
      ALTER TABLE inventory_items
        ADD CONSTRAINT fk_inventory_items_category_id
        FOREIGN KEY (category_id)
        REFERENCES inventory_categories (id)
    `);
    await queryRunner.query(`
      ALTER TABLE inventory_items
        ALTER COLUMN category_id SET NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX idx_inventory_items_tenant_category_id_status
        ON inventory_items (tenant_id, category_id, status)
    `);
  }
  async down(queryRunner) {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_inventory_items_tenant_category_id_status
    `);
    await queryRunner.query(`
      ALTER TABLE inventory_items
        DROP CONSTRAINT IF EXISTS fk_inventory_items_category_id
    `);
    await queryRunner.query(`
      ALTER TABLE inventory_items
        DROP COLUMN IF EXISTS category_id
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS inventory_categories
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS inventory_category_status
    `);
  }
}
exports.CreateInventoryCategories0520000000000 = CreateInventoryCategories0520000000000;
//# sourceMappingURL=052_create_inventory_categories.js.map
