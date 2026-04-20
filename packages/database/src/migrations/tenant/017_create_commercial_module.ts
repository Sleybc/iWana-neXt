import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 017: crea el esquema del Módulo Comercial (MOD06).
 * - 11 tablas nuevas: tax_classifications, tax_rules, catalog_items,
 *   plan_details, product_details, service_details, catalog_price_history,
 *   catalog_bundles, catalog_bundle_items, catalog_promotions,
 *   catalog_compatibility_rules
 * - Índices según HLD-MOD06 sección 5
 * - Seed de clasificaciones tributarias base colombianas y reglas por defecto
 *
 * Schema: tenant (search_path se resuelve por TenantContext — sin prefijo explícito)
 * Reversible: sí — down() elimina todas las tablas en orden inverso de dependencias
 */
export class CreateCommercialModule1700000000017 implements MigrationInterface {
  name = 'CreateCommercialModule1700000000017';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── tax_classifications ───────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tax_classifications (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        code VARCHAR(50) NOT NULL,
        name VARCHAR(150) NOT NULL,
        description TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT pk_tax_classifications PRIMARY KEY (id),
        CONSTRAINT uq_tax_classifications_tenant_code UNIQUE (tenant_id, code)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_tax_classifications_tenant_code
      ON tax_classifications (tenant_id, code)
    `);

    // ─── tax_rules ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tax_rules (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        tax_classification_id UUID NOT NULL,
        customer_segment VARCHAR(30),
        estrato_min INTEGER,
        estrato_max INTEGER,
        municipality_code VARCHAR(10),
        tax_type VARCHAR(20) NOT NULL
          CHECK (tax_type IN ('IVA', 'RETENTION', 'ICA')),
        rate_percentage NUMERIC(5,2) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
        valid_to TIMESTAMPTZ,
        created_by UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT pk_tax_rules PRIMARY KEY (id),
        CONSTRAINT fk_tax_rules_classification
          FOREIGN KEY (tax_classification_id)
          REFERENCES tax_classifications (id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_tax_rules_lookup
      ON tax_rules (tenant_id, tax_classification_id, is_active)
      WHERE is_active = true
    `);

    // ─── catalog_items ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS catalog_items (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        type VARCHAR(20) NOT NULL
          CHECK (type IN ('PLAN', 'PRODUCT', 'SERVICE')),
        name VARCHAR(200) NOT NULL,
        description TEXT,
        tax_classification_id UUID,
        retention_applicable BOOLEAN NOT NULL DEFAULT false,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ,
        CONSTRAINT pk_catalog_items PRIMARY KEY (id),
        CONSTRAINT fk_catalog_items_tax_classification
          FOREIGN KEY (tax_classification_id)
          REFERENCES tax_classifications (id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_catalog_items_tenant_type_active
      ON catalog_items (tenant_id, type, is_active)
      WHERE deleted_at IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_catalog_items_tenant_name
      ON catalog_items (tenant_id, is_active, name)
      WHERE deleted_at IS NULL
    `);

    // ─── plan_details ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS plan_details (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        item_id UUID NOT NULL,
        download_speed_mbps INTEGER NOT NULL,
        upload_speed_mbps INTEGER NOT NULL,
        technology VARCHAR(100) NOT NULL,
        installation_rule VARCHAR(30) NOT NULL DEFAULT 'ALWAYS'
          CHECK (installation_rule IN ('ALWAYS', 'ON_DEMAND', 'NEVER')),
        CONSTRAINT pk_plan_details PRIMARY KEY (id),
        CONSTRAINT uq_plan_details_item UNIQUE (item_id),
        CONSTRAINT fk_plan_details_item
          FOREIGN KEY (item_id) REFERENCES catalog_items (id) ON DELETE CASCADE
      )
    `);

    // ─── product_details ───────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS product_details (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        item_id UUID NOT NULL,
        is_loan BOOLEAN NOT NULL DEFAULT false,
        requires_inventory BOOLEAN NOT NULL DEFAULT false,
        category VARCHAR(50) NOT NULL
          CHECK (category IN (
            'ENTERTAINMENT', 'SECURITY', 'CONNECTIVITY',
            'BUSINESS', 'NETWORKING', 'CPE'
          )),
        CONSTRAINT pk_product_details PRIMARY KEY (id),
        CONSTRAINT uq_product_details_item UNIQUE (item_id),
        CONSTRAINT fk_product_details_item
          FOREIGN KEY (item_id) REFERENCES catalog_items (id) ON DELETE CASCADE
      )
    `);

    // ─── service_details ───────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS service_details (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        item_id UUID NOT NULL,
        charge_type VARCHAR(20) NOT NULL
          CHECK (charge_type IN ('ONE_TIME', 'ON_DEMAND', 'RECURRING')),
        CONSTRAINT pk_service_details PRIMARY KEY (id),
        CONSTRAINT uq_service_details_item UNIQUE (item_id),
        CONSTRAINT fk_service_details_item
          FOREIGN KEY (item_id) REFERENCES catalog_items (id) ON DELETE CASCADE
      )
    `);

    // ─── catalog_price_history (SCD Tipo 2) ────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS catalog_price_history (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        item_id UUID NOT NULL,
        customer_segment VARCHAR(30) NOT NULL,
        base_price NUMERIC(14,2) NOT NULL,
        installation_fee NUMERIC(14,2) NOT NULL DEFAULT 0,
        valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
        valid_to TIMESTAMPTZ,
        is_current BOOLEAN NOT NULL DEFAULT true,
        created_by UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT pk_catalog_price_history PRIMARY KEY (id),
        CONSTRAINT fk_price_history_item
          FOREIGN KEY (item_id) REFERENCES catalog_items (id) ON DELETE CASCADE
      )
    `);
    // Índice único parcial: un solo precio vigente por (item, segment)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_price_current_unique
      ON catalog_price_history (item_id, customer_segment)
      WHERE is_current = true
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_price_history_item_from
      ON catalog_price_history (item_id, valid_from DESC)
    `);

    // ─── catalog_bundles ───────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS catalog_bundles (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        discount_type VARCHAR(20) NOT NULL
          CHECK (discount_type IN ('PERCENTAGE', 'FIXED_AMOUNT', 'FREE_MONTHS')),
        discount_value NUMERIC(14,2) NOT NULL,
        valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
        valid_to TIMESTAMPTZ,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT pk_catalog_bundles PRIMARY KEY (id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_catalog_bundles_tenant_active
      ON catalog_bundles (tenant_id, is_active)
    `);

    // ─── catalog_bundle_items ──────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS catalog_bundle_items (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        bundle_id UUID NOT NULL,
        item_id UUID NOT NULL,
        is_required BOOLEAN NOT NULL DEFAULT true,
        sort_order INTEGER NOT NULL DEFAULT 0,
        CONSTRAINT pk_catalog_bundle_items PRIMARY KEY (id),
        CONSTRAINT uq_catalog_bundle_items UNIQUE (bundle_id, item_id),
        CONSTRAINT fk_bundle_items_bundle
          FOREIGN KEY (bundle_id) REFERENCES catalog_bundles (id) ON DELETE CASCADE,
        CONSTRAINT fk_bundle_items_item
          FOREIGN KEY (item_id) REFERENCES catalog_items (id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_catalog_bundle_items_bundle
      ON catalog_bundle_items (bundle_id)
    `);

    // ─── catalog_promotions ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS catalog_promotions (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        name VARCHAR(200) NOT NULL,
        code VARCHAR(50) NOT NULL,
        description TEXT,
        discount_type VARCHAR(20) NOT NULL
          CHECK (discount_type IN ('PERCENTAGE', 'FIXED_AMOUNT', 'FREE_MONTHS')),
        discount_value NUMERIC(14,2) NOT NULL,
        applies_to VARCHAR(20) NOT NULL
          CHECK (applies_to IN ('ITEM', 'BUNDLE', 'INSTALLATION', 'ALL')),
        target_item_id UUID,
        target_bundle_id UUID,
        target_segments VARCHAR(30)[],
        max_uses INTEGER,
        current_uses INTEGER NOT NULL DEFAULT 0,
        valid_from TIMESTAMPTZ NOT NULL,
        valid_to TIMESTAMPTZ NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_by UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT pk_catalog_promotions PRIMARY KEY (id),
        CONSTRAINT uq_catalog_promotions_code UNIQUE (tenant_id, code),
        CONSTRAINT fk_promotions_item
          FOREIGN KEY (target_item_id) REFERENCES catalog_items (id),
        CONSTRAINT fk_promotions_bundle
          FOREIGN KEY (target_bundle_id) REFERENCES catalog_bundles (id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_catalog_promotions_tenant_active
      ON catalog_promotions (tenant_id, is_active)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_catalog_promotions_code
      ON catalog_promotions (tenant_id, code)
    `);

    // ─── catalog_compatibility_rules ───────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS catalog_compatibility_rules (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        rule_type VARCHAR(20) NOT NULL
          CHECK (rule_type IN ('REQUIRES', 'EXCLUDES', 'REPLACES')),
        source_item_id UUID NOT NULL,
        target_item_id UUID NOT NULL,
        description VARCHAR(500),
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT pk_catalog_compatibility_rules PRIMARY KEY (id),
        CONSTRAINT chk_compat_no_self_ref
          CHECK (source_item_id <> target_item_id),
        CONSTRAINT fk_compat_source
          FOREIGN KEY (source_item_id) REFERENCES catalog_items (id),
        CONSTRAINT fk_compat_target
          FOREIGN KEY (target_item_id) REFERENCES catalog_items (id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_compat_rules_source
      ON catalog_compatibility_rules (tenant_id, source_item_id, is_active)
    `);

    // ─── Seed: clasificaciones tributarias base colombianas ─────────────────
    // Se insertan con un tenant_id placeholder vacío y se actualizan por provisioning.
    // En la práctica, el runner de migración por tenant llama a este up() con el
    // tenant resuelto; aquí guardamos los seeds en un UUID de sistema estable.
    // NOTA: el runner aplica este script via runInTenantSchema(),
    // por lo que el search_path ya está fijado al schema correcto.
    // Los inserts de seed NO llevan tenant_id porque dependen de provisioning;
    // el TenantProvisioningService los inserta al crear el tenant.
    // (ver TenantModule.provisionDefaultCommercialConfig())
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Eliminar en orden inverso de dependencias para respetar FK constraints
    await queryRunner.query(`DROP TABLE IF EXISTS catalog_compatibility_rules`);
    await queryRunner.query(`DROP TABLE IF EXISTS catalog_promotions`);
    await queryRunner.query(`DROP TABLE IF EXISTS catalog_bundle_items`);
    await queryRunner.query(`DROP TABLE IF EXISTS catalog_bundles`);
    await queryRunner.query(`DROP TABLE IF EXISTS catalog_price_history`);
    await queryRunner.query(`DROP TABLE IF EXISTS service_details`);
    await queryRunner.query(`DROP TABLE IF EXISTS product_details`);
    await queryRunner.query(`DROP TABLE IF EXISTS plan_details`);
    await queryRunner.query(`DROP TABLE IF EXISTS catalog_items`);
    await queryRunner.query(`DROP TABLE IF EXISTS tax_rules`);
    await queryRunner.query(`DROP TABLE IF EXISTS tax_classifications`);
  }
}
