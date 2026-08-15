import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 113 — endurece constraints e índices del catálogo comercial (Track B MOD06).
 *
 * - Unique REPLACES (un sucesor activo) + unique activo (source, target, rule_type).
 * - CHECK SCD is_current ↔ valid_to IS NULL (solo si no hay suciedad).
 * - CHECKs de montos/tasas y rangos de vigencia/estrato.
 * - FK + unique de tax_rule_applications → tax_rules (sin FK a tax_definitions).
 * - tenant_id en catalog_price_history (backfill desde catalog_items).
 * - Índices de apoyo bundle_items / promotions / tax matcher.
 *
 * Schema: tenant (search_path). Reversible: sí.
 * Pre-checks: abortan con RAISE EXCEPTION y conteo (sin PII).
 */
export class HardenCommercialConstraints1130000000000 implements MigrationInterface {
  name = 'HardenCommercialConstraints1130000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $migration$
      DECLARE
        dirty_scd INTEGER;
        dirty_valid_to INTEGER;
        orphan_apps INTEGER;
        dup_apps INTEGER;
        dirty_money INTEGER;
        dirty_promo INTEGER;
        dirty_stratum INTEGER;
        null_price_tenant INTEGER;
      BEGIN
        SELECT COUNT(*) INTO dirty_scd
        FROM catalog_price_history
        WHERE is_current IS DISTINCT FROM (valid_to IS NULL);
        IF dirty_scd > 0 THEN
          RAISE EXCEPTION
            '113 abort: % filas SCD con is_current distinto de (valid_to IS NULL)',
            dirty_scd;
        END IF;

        SELECT COUNT(*) INTO dirty_valid_to
        FROM (
          SELECT item_id, customer_segment
          FROM catalog_price_history
          WHERE valid_to IS NULL
          GROUP BY item_id, customer_segment
          HAVING COUNT(*) > 1
        ) dups;
        IF dirty_valid_to > 0 THEN
          RAISE EXCEPTION
            '113 abort: % pares (item, segmento) con más de un valid_to IS NULL',
            dirty_valid_to;
        END IF;

        SELECT COUNT(*) INTO orphan_apps
        FROM tax_rule_applications tra
        WHERE NOT EXISTS (SELECT 1 FROM tax_rules tr WHERE tr.id = tra.tax_rule_id);
        IF orphan_apps > 0 THEN
          RAISE EXCEPTION
            '113 abort: % tax_rule_applications huérfanas (sin tax_rules)',
            orphan_apps;
        END IF;

        SELECT COUNT(*) INTO dup_apps
        FROM (
          SELECT tax_rule_id, tax_definition_id
          FROM tax_rule_applications
          GROUP BY tax_rule_id, tax_definition_id
          HAVING COUNT(*) > 1
        ) dups;
        IF dup_apps > 0 THEN
          RAISE EXCEPTION
            '113 abort: % combinaciones duplicadas tax_rule_id+tax_definition_id',
            dup_apps;
        END IF;

        SELECT COUNT(*) INTO dirty_money
        FROM (
          SELECT 1 FROM catalog_price_history WHERE base_price < 0 OR installation_fee < 0
          UNION ALL
          SELECT 1 FROM catalog_bundles WHERE discount_value < 0
          UNION ALL
          SELECT 1 FROM catalog_promotions WHERE discount_value < 0
          UNION ALL
          SELECT 1 FROM tax_rules WHERE rate_percentage < 0 OR rate_percentage > 100
        ) money;
        IF dirty_money > 0 THEN
          RAISE EXCEPTION '113 abort: % filas con montos o tasas fuera de rango', dirty_money;
        END IF;

        SELECT COUNT(*) INTO dirty_promo
        FROM catalog_promotions
        WHERE valid_from > valid_to;
        IF dirty_promo > 0 THEN
          RAISE EXCEPTION '113 abort: % promociones con valid_from > valid_to', dirty_promo;
        END IF;

        SELECT COUNT(*) INTO dirty_stratum
        FROM tax_rules
        WHERE stratum_from IS NOT NULL
          AND stratum_to IS NOT NULL
          AND stratum_from > stratum_to;
        IF dirty_stratum > 0 THEN
          RAISE EXCEPTION '113 abort: % tax_rules con stratum_from > stratum_to', dirty_stratum;
        END IF;

        SELECT COUNT(*) INTO null_price_tenant
        FROM catalog_price_history ph
        WHERE NOT EXISTS (SELECT 1 FROM catalog_items ci WHERE ci.id = ph.item_id);
        IF null_price_tenant > 0 THEN
          RAISE EXCEPTION
            '113 abort: % precios sin catalog_item para backfill de tenant_id',
            null_price_tenant;
        END IF;
      END
      $migration$
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS idx_compat_one_active_successor`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_compat_one_active_replaces
      ON catalog_compatibility_rules (source_item_id)
      WHERE is_active = true AND rule_type = 'REPLACES'
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_compat_active_triplet
      ON catalog_compatibility_rules (source_item_id, target_item_id, rule_type)
      WHERE is_active = true
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_compat_target_active
      ON catalog_compatibility_rules (tenant_id, target_item_id, is_active)
    `);

    await queryRunner.query(`
      ALTER TABLE catalog_price_history
        ADD CONSTRAINT chk_price_history_is_current_valid_to
        CHECK (is_current = (valid_to IS NULL))
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_price_valid_to_null_unique
      ON catalog_price_history (item_id, customer_segment)
      WHERE valid_to IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE catalog_price_history
        ADD CONSTRAINT chk_price_history_base_price_nonneg CHECK (base_price >= 0)
    `);
    await queryRunner.query(`
      ALTER TABLE catalog_price_history
        ADD CONSTRAINT chk_price_history_installation_fee_nonneg CHECK (installation_fee >= 0)
    `);

    await queryRunner.query(`
      ALTER TABLE catalog_bundles
        ADD CONSTRAINT chk_bundle_discount_value_nonneg CHECK (discount_value >= 0)
    `);
    await queryRunner.query(`
      ALTER TABLE catalog_promotions
        ADD CONSTRAINT chk_promo_discount_value_nonneg CHECK (discount_value >= 0)
    `);
    await queryRunner.query(`
      ALTER TABLE catalog_promotions
        ADD CONSTRAINT chk_promo_valid_range CHECK (valid_from <= valid_to)
    `);
    await queryRunner.query(`
      ALTER TABLE tax_rules
        ADD CONSTRAINT chk_tax_rate_percentage CHECK (rate_percentage >= 0 AND rate_percentage <= 100)
    `);
    await queryRunner.query(`
      ALTER TABLE tax_rules
        ADD CONSTRAINT chk_tax_stratum_range
        CHECK (stratum_from IS NULL OR stratum_to IS NULL OR stratum_from <= stratum_to)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_tax_rules_matcher
      ON tax_rules (tenant_id, is_active, customer_segment, priority DESC)
      WHERE is_active = true
    `);

    await queryRunner.query(`
      ALTER TABLE tax_rule_applications
        ADD CONSTRAINT fk_tax_rule_applications_rule
        FOREIGN KEY (tax_rule_id) REFERENCES tax_rules (id)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_tax_rule_applications_rule_def
      ON tax_rule_applications (tax_rule_id, tax_definition_id)
    `);

    await queryRunner.query(`
      ALTER TABLE catalog_price_history
        ADD COLUMN IF NOT EXISTS tenant_id UUID
    `);
    await queryRunner.query(`
      UPDATE catalog_price_history ph
      SET tenant_id = ci.tenant_id
      FROM catalog_items ci
      WHERE ci.id = ph.item_id
        AND ph.tenant_id IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE catalog_price_history
        ALTER COLUMN tenant_id SET NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_catalog_bundle_items_item
      ON catalog_bundle_items (item_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_catalog_promotions_tenant_active_from
      ON catalog_promotions (tenant_id, is_active, valid_from DESC, id DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_catalog_bundles_tenant_active_valid_to
      ON catalog_bundles (tenant_id, is_active, valid_to)
      WHERE is_active = true AND valid_to IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_catalog_bundles_tenant_active_valid_to`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_catalog_promotions_tenant_active_from`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_catalog_bundle_items_item`);

    await queryRunner.query(`
      ALTER TABLE catalog_price_history DROP COLUMN IF EXISTS tenant_id
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS uq_tax_rule_applications_rule_def`);
    await queryRunner.query(`
      ALTER TABLE tax_rule_applications
        DROP CONSTRAINT IF EXISTS fk_tax_rule_applications_rule
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS idx_tax_rules_matcher`);

    await queryRunner.query(
      `ALTER TABLE tax_rules DROP CONSTRAINT IF EXISTS chk_tax_stratum_range`,
    );
    await queryRunner.query(
      `ALTER TABLE tax_rules DROP CONSTRAINT IF EXISTS chk_tax_rate_percentage`,
    );
    await queryRunner.query(
      `ALTER TABLE catalog_promotions DROP CONSTRAINT IF EXISTS chk_promo_valid_range`,
    );
    await queryRunner.query(
      `ALTER TABLE catalog_promotions DROP CONSTRAINT IF EXISTS chk_promo_discount_value_nonneg`,
    );
    await queryRunner.query(
      `ALTER TABLE catalog_bundles DROP CONSTRAINT IF EXISTS chk_bundle_discount_value_nonneg`,
    );
    await queryRunner.query(
      `ALTER TABLE catalog_price_history DROP CONSTRAINT IF EXISTS chk_price_history_installation_fee_nonneg`,
    );
    await queryRunner.query(
      `ALTER TABLE catalog_price_history DROP CONSTRAINT IF EXISTS chk_price_history_base_price_nonneg`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS idx_price_valid_to_null_unique`);
    await queryRunner.query(
      `ALTER TABLE catalog_price_history DROP CONSTRAINT IF EXISTS chk_price_history_is_current_valid_to`,
    );

    await queryRunner.query(`DROP INDEX IF EXISTS idx_compat_target_active`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_compat_active_triplet`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_compat_one_active_replaces`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_compat_one_active_successor
      ON catalog_compatibility_rules (source_item_id)
      WHERE is_active = true
    `);
  }
}
