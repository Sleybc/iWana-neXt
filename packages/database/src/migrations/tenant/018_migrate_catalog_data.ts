import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 018: migra datos del catálogo heredado al nuevo esquema comercial (MOD06).
 *
 * Origen:
 *   - plan_catalog_items   → catalog_items (type=PLAN) + plan_details + catalog_price_history
 *   - additional_products  → catalog_items (type=PRODUCT) + product_details
 *
 * Estrategia:
 *   - Aditiva: las tablas origen NO se eliminan (se deprecan).
 *   - Transaccional: si falla cualquier paso, se revierte todo.
 *   - La clasificación tributaria IVA_FULL se asigna por defecto a todos los ítems
 *     migrados; el administrador puede reclasificarlos desde la UI.
 *   - El precio SCD se crea con valid_from = created_at del plan origen.
 *   - created_by del precio SCD usa el tenant_id como proxy (no hay userId disponible
 *     en migración; se documenta como valor de sistema).
 *
 * Reversibilidad: down() trunca las tablas nuevas (no recupera datos origen).
 *
 * Schema: tenant (search_path resuelto por TenantContext — sin prefijo explícito)
 */
export class MigrateCatalogData1700000000018 implements MigrationInterface {
  name = 'MigrateCatalogData1700000000018';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── 1. Crear clasificación tributaria por defecto si no existe ───────
    // Esta clasificación se usará para todos los ítems migrados.
    // El seed definitivo se hace vía TenantProvisioningService al provisionar
    // nuevos tenants; aquí garantizamos que exista para tenants ya existentes.
    await queryRunner.query(`
      INSERT INTO tax_classifications (tenant_id, code, name, description, is_active)
      SELECT DISTINCT
        pci.tenant_id,
        'IVA_FULL',
        'IVA pleno 19%',
        'Clasificación base para servicios de Internet con IVA pleno (estrato 4-6)',
        true
      FROM plan_catalog_items pci
      WHERE NOT EXISTS (
        SELECT 1 FROM tax_classifications tc
        WHERE tc.tenant_id = pci.tenant_id
          AND tc.code = 'IVA_FULL'
      )
      ON CONFLICT (tenant_id, code) DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO tax_classifications (tenant_id, code, name, description, is_active)
      SELECT DISTINCT
        pci.tenant_id,
        'IVA_EXEMPT',
        'IVA exento 0%',
        'Estrato 1-2: servicio de Internet exento de IVA (derecho a deducción)',
        true
      FROM plan_catalog_items pci
      WHERE NOT EXISTS (
        SELECT 1 FROM tax_classifications tc
        WHERE tc.tenant_id = pci.tenant_id
          AND tc.code = 'IVA_EXEMPT'
      )
      ON CONFLICT (tenant_id, code) DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO tax_classifications (tenant_id, code, name, description, is_active)
      SELECT DISTINCT
        pci.tenant_id,
        'IVA_EXCLUDED',
        'IVA excluido',
        'Estrato 3: servicio de Internet excluido de IVA (sin deducción)',
        true
      FROM plan_catalog_items pci
      WHERE NOT EXISTS (
        SELECT 1 FROM tax_classifications tc
        WHERE tc.tenant_id = pci.tenant_id
          AND tc.code = 'IVA_EXCLUDED'
      )
      ON CONFLICT (tenant_id, code) DO NOTHING
    `);

    // También garantizar seed para tenants que solo tienen additional_products
    await queryRunner.query(`
      INSERT INTO tax_classifications (tenant_id, code, name, description, is_active)
      SELECT DISTINCT
        ap.tenant_id,
        'IVA_FULL',
        'IVA pleno 19%',
        'Clasificación base para servicios de Internet con IVA pleno (estrato 4-6)',
        true
      FROM additional_products ap
      WHERE NOT EXISTS (
        SELECT 1 FROM tax_classifications tc
        WHERE tc.tenant_id = ap.tenant_id
          AND tc.code = 'IVA_FULL'
      )
      ON CONFLICT (tenant_id, code) DO NOTHING
    `);

    // ─── 2. Migrar plan_catalog_items → catalog_items + plan_details ──────
    await queryRunner.query(`
      INSERT INTO catalog_items (
        id, tenant_id, type, name, description,
        tax_classification_id, retention_applicable,
        is_active, created_at, updated_at, deleted_at
      )
      SELECT
        pci.id,
        pci.tenant_id,
        'PLAN',
        pci.name,
        NULL,
        tc.id,
        false,
        pci.is_active,
        pci.created_at,
        pci.updated_at,
        NULL
      FROM plan_catalog_items pci
      JOIN tax_classifications tc
        ON tc.tenant_id = pci.tenant_id
       AND tc.code = 'IVA_FULL'
      ON CONFLICT (id) DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO plan_details (
        item_id, download_speed_mbps, upload_speed_mbps,
        technology, installation_rule
      )
      SELECT
        pci.id,
        pci.download_speed_mbps,
        pci.upload_speed_mbps,
        pci.technology,
        CASE
          WHEN pci.installation_rule = 'FIBER_DROP_THRESHOLD' THEN 'ON_DEMAND'
          WHEN pci.installation_rule = 'NONE' THEN 'NEVER'
          WHEN pci.installation_rule = 'ALWAYS' THEN 'ALWAYS'
          ELSE 'ALWAYS'
        END
      FROM plan_catalog_items pci
      WHERE EXISTS (
        SELECT 1 FROM catalog_items ci WHERE ci.id = pci.id
      )
      ON CONFLICT (item_id) DO NOTHING
    `);

    // ─── 3. Crear precio SCD inicial para cada plan migrado ───────────────
    // Un precio por plan (sin segmentación por defecto — segmento RESIDENTIAL).
    // El administrador puede agregar precios adicionales por segmento desde la UI.
    await queryRunner.query(`
      INSERT INTO catalog_price_history (
        item_id, customer_segment, base_price, installation_fee,
        valid_from, valid_to, is_current, created_by, created_at
      )
      SELECT
        pci.id,
        'RESIDENTIAL',
        pci.base_price,
        pci.installation_fee,
        COALESCE(pci.valid_from, pci.created_at),
        NULL,
        true,
        pci.tenant_id,
        pci.created_at
      FROM plan_catalog_items pci
      WHERE EXISTS (
        SELECT 1 FROM catalog_items ci WHERE ci.id = pci.id
      )
      ON CONFLICT DO NOTHING
    `);

    // ─── 4. Migrar additional_products → catalog_items + product_details ──
    await queryRunner.query(`
      INSERT INTO catalog_items (
        id, tenant_id, type, name, description,
        tax_classification_id, retention_applicable,
        is_active, created_at, updated_at, deleted_at
      )
      SELECT
        ap.id,
        ap.tenant_id,
        'PRODUCT',
        ap.name,
        NULL,
        tc.id,
        false,
        ap.is_active,
        ap.created_at,
        ap.updated_at,
        ap.deleted_at
      FROM additional_products ap
      JOIN tax_classifications tc
        ON tc.tenant_id = ap.tenant_id
       AND tc.code = 'IVA_FULL'
      ON CONFLICT (id) DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO product_details (
        item_id, is_loan, requires_inventory, category
      )
      SELECT
        ap.id,
        false,
        false,
        ap.category::VARCHAR
      FROM additional_products ap
      WHERE EXISTS (
        SELECT 1 FROM catalog_items ci WHERE ci.id = ap.id
      )
      ON CONFLICT (item_id) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Elimina únicamente los datos insertados por esta migración.
    // Las tablas origen (plan_catalog_items, additional_products) NO se tocan.
    await queryRunner.query(`
      DELETE FROM catalog_price_history
      WHERE item_id IN (
        SELECT id FROM plan_catalog_items
      )
    `);
    await queryRunner.query(`
      DELETE FROM plan_details
      WHERE item_id IN (
        SELECT id FROM plan_catalog_items
      )
    `);
    await queryRunner.query(`
      DELETE FROM product_details
      WHERE item_id IN (
        SELECT id FROM additional_products
      )
    `);
    await queryRunner.query(`
      DELETE FROM catalog_items
      WHERE id IN (
        SELECT id FROM plan_catalog_items
        UNION
        SELECT id FROM additional_products
      )
    `);
    await queryRunner.query(`
      DELETE FROM tax_classifications
      WHERE code IN ('IVA_FULL', 'IVA_EXEMPT', 'IVA_EXCLUDED')
    `);
  }
}
