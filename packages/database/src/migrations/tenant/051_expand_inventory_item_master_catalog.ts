import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migracion 051: evoluciona inventory_items al catalogo maestro operativo de MOD12.
 */
export class ExpandInventoryItemMasterCatalog0510000000000 implements MigrationInterface {
  name = 'ExpandInventoryItemMasterCatalog0510000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE inventory_item_kind AS ENUM (
        'STOCK',
        'CONSUMABLE',
        'SERIALIZED',
        'SERVICE'
      )
    `);

    await queryRunner.query(`
      ALTER TABLE inventory_items
        ADD COLUMN description TEXT,
        ADD COLUMN brand VARCHAR(120),
        ADD COLUMN model VARCHAR(120),
        ADD COLUMN item_kind inventory_item_kind NOT NULL DEFAULT 'STOCK',
        ADD COLUMN purchasable BOOLEAN NOT NULL DEFAULT TRUE,
        ADD COLUMN inventory_controlled BOOLEAN NOT NULL DEFAULT TRUE,
        ADD COLUMN asset_controlled BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN preferred_supplier_ref_id UUID,
        ADD COLUMN supplier_sku VARCHAR(80),
        ADD COLUMN purchase_unit_of_measure VARCHAR(32),
        ADD COLUMN purchase_to_base_uom_factor NUMERIC(12,4),
        ADD COLUMN standard_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
        ADD COLUMN last_purchase_cost NUMERIC(14,2),
        ADD COLUMN reorder_point NUMERIC(12,2) NOT NULL DEFAULT 0,
        ADD COLUMN target_stock NUMERIC(12,2) NOT NULL DEFAULT 0,
        ADD COLUMN minimum_order_qty NUMERIC(12,2),
        ADD COLUMN order_multiple NUMERIC(12,2),
        ADD COLUMN lead_time_days INTEGER,
        ADD COLUMN commercial_reference_id VARCHAR(160)
    `);

    await queryRunner.query(`
      UPDATE inventory_items
      SET
        standard_cost = base_cost,
        reorder_point = minimum_stock,
        target_stock = minimum_stock,
        purchasable = (status = 'ACTIVE'),
        inventory_controlled = TRUE,
        asset_controlled = tracking_mode IN ('SERIALIZED', 'FIXED_ASSET'),
        item_kind = CASE
          WHEN tracking_mode = 'CONSUMABLE' THEN 'CONSUMABLE'::inventory_item_kind
          WHEN tracking_mode = 'SERIALIZED' THEN 'SERIALIZED'::inventory_item_kind
          WHEN tracking_mode = 'FIXED_ASSET' THEN 'SERIALIZED'::inventory_item_kind
          ELSE 'STOCK'::inventory_item_kind
        END
    `);

    await queryRunner.query(`
      CREATE INDEX idx_inventory_items_tenant_status_purchasable
        ON inventory_items (tenant_id, status, purchasable)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_inventory_items_tenant_item_kind_status
        ON inventory_items (tenant_id, item_kind, status)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_inventory_items_tenant_preferred_supplier
        ON inventory_items (tenant_id, preferred_supplier_ref_id)
        WHERE preferred_supplier_ref_id IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX idx_inventory_items_tenant_sku_name_search
        ON inventory_items (tenant_id, lower(sku), lower(name))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_inventory_items_tenant_sku_name_search`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_inventory_items_tenant_preferred_supplier`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_inventory_items_tenant_item_kind_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_inventory_items_tenant_status_purchasable`);

    await queryRunner.query(`
      ALTER TABLE inventory_items
        DROP COLUMN IF EXISTS commercial_reference_id,
        DROP COLUMN IF EXISTS lead_time_days,
        DROP COLUMN IF EXISTS order_multiple,
        DROP COLUMN IF EXISTS minimum_order_qty,
        DROP COLUMN IF EXISTS target_stock,
        DROP COLUMN IF EXISTS reorder_point,
        DROP COLUMN IF EXISTS last_purchase_cost,
        DROP COLUMN IF EXISTS standard_cost,
        DROP COLUMN IF EXISTS purchase_to_base_uom_factor,
        DROP COLUMN IF EXISTS purchase_unit_of_measure,
        DROP COLUMN IF EXISTS supplier_sku,
        DROP COLUMN IF EXISTS preferred_supplier_ref_id,
        DROP COLUMN IF EXISTS asset_controlled,
        DROP COLUMN IF EXISTS inventory_controlled,
        DROP COLUMN IF EXISTS purchasable,
        DROP COLUMN IF EXISTS item_kind,
        DROP COLUMN IF EXISTS model,
        DROP COLUMN IF EXISTS brand,
        DROP COLUMN IF EXISTS description
    `);

    await queryRunner.query(`DROP TYPE IF EXISTS inventory_item_kind`);
  }
}
