'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.SeedCommercialDefaultTaxRules1700000000019 = void 0;
/**
 * Migración 019: siembra reglas tributarias base de MOD06 para tenants ya migrados.
 *
 * Cubre la brecha entre las clasificaciones base creadas en migraciones previas
 * y las reglas por defecto esperadas por el PRD/HLD/prompt de ejecución.
 *
 * Estrategia:
 * - Idempotente: cada insert verifica si la regla ya existe para el tenant.
 * - Conservadora: no altera reglas activas existentes creadas por usuarios.
 * - Usa tenant_id como created_by técnico, consistente con la migración 018.
 */
class SeedCommercialDefaultTaxRules1700000000019 {
  name = 'SeedCommercialDefaultTaxRules1700000000019';
  async up(queryRunner) {
    await queryRunner.query(`
      INSERT INTO tax_rules (
        tenant_id,
        tax_classification_id,
        customer_segment,
        estrato_min,
        estrato_max,
        municipality_code,
        tax_type,
        rate_percentage,
        is_active,
        valid_from,
        valid_to,
        created_by
      )
      SELECT
        tc.tenant_id,
        tc.id,
        'RESIDENTIAL',
        1,
        2,
        NULL,
        'IVA',
        0,
        true,
        now(),
        NULL,
        tc.tenant_id
      FROM tax_classifications tc
      WHERE tc.code = 'IVA_EXEMPT'
        AND NOT EXISTS (
          SELECT 1
          FROM tax_rules tr
          WHERE tr.tenant_id = tc.tenant_id
            AND tr.tax_classification_id = tc.id
            AND tr.customer_segment = 'RESIDENTIAL'
            AND tr.estrato_min = 1
            AND tr.estrato_max = 2
            AND tr.tax_type = 'IVA'
            AND tr.rate_percentage = 0
            AND tr.is_active = true
        )
    `);
    await queryRunner.query(`
      INSERT INTO tax_rules (
        tenant_id,
        tax_classification_id,
        customer_segment,
        estrato_min,
        estrato_max,
        municipality_code,
        tax_type,
        rate_percentage,
        is_active,
        valid_from,
        valid_to,
        created_by
      )
      SELECT
        tc.tenant_id,
        tc.id,
        'RESIDENTIAL',
        3,
        3,
        NULL,
        'IVA',
        0,
        true,
        now(),
        NULL,
        tc.tenant_id
      FROM tax_classifications tc
      WHERE tc.code = 'IVA_EXCLUDED'
        AND NOT EXISTS (
          SELECT 1
          FROM tax_rules tr
          WHERE tr.tenant_id = tc.tenant_id
            AND tr.tax_classification_id = tc.id
            AND tr.customer_segment = 'RESIDENTIAL'
            AND tr.estrato_min = 3
            AND tr.estrato_max = 3
            AND tr.tax_type = 'IVA'
            AND tr.rate_percentage = 0
            AND tr.is_active = true
        )
    `);
    await queryRunner.query(`
      INSERT INTO tax_rules (
        tenant_id,
        tax_classification_id,
        customer_segment,
        estrato_min,
        estrato_max,
        municipality_code,
        tax_type,
        rate_percentage,
        is_active,
        valid_from,
        valid_to,
        created_by
      )
      SELECT
        tc.tenant_id,
        tc.id,
        'RESIDENTIAL',
        4,
        6,
        NULL,
        'IVA',
        19,
        true,
        now(),
        NULL,
        tc.tenant_id
      FROM tax_classifications tc
      WHERE tc.code = 'IVA_FULL'
        AND NOT EXISTS (
          SELECT 1
          FROM tax_rules tr
          WHERE tr.tenant_id = tc.tenant_id
            AND tr.tax_classification_id = tc.id
            AND tr.customer_segment = 'RESIDENTIAL'
            AND tr.estrato_min = 4
            AND tr.estrato_max = 6
            AND tr.tax_type = 'IVA'
            AND tr.rate_percentage = 19
            AND tr.is_active = true
        )
    `);
    await queryRunner.query(`
      INSERT INTO tax_rules (
        tenant_id,
        tax_classification_id,
        customer_segment,
        estrato_min,
        estrato_max,
        municipality_code,
        tax_type,
        rate_percentage,
        is_active,
        valid_from,
        valid_to,
        created_by
      )
      SELECT
        tc.tenant_id,
        tc.id,
        'CORPORATE',
        NULL,
        NULL,
        NULL,
        'IVA',
        19,
        true,
        now(),
        NULL,
        tc.tenant_id
      FROM tax_classifications tc
      WHERE tc.code = 'IVA_FULL'
        AND NOT EXISTS (
          SELECT 1
          FROM tax_rules tr
          WHERE tr.tenant_id = tc.tenant_id
            AND tr.tax_classification_id = tc.id
            AND tr.customer_segment = 'CORPORATE'
            AND tr.estrato_min IS NULL
            AND tr.estrato_max IS NULL
            AND tr.tax_type = 'IVA'
            AND tr.rate_percentage = 19
            AND tr.is_active = true
        )
    `);
    await queryRunner.query(`
      INSERT INTO tax_rules (
        tenant_id,
        tax_classification_id,
        customer_segment,
        estrato_min,
        estrato_max,
        municipality_code,
        tax_type,
        rate_percentage,
        is_active,
        valid_from,
        valid_to,
        created_by
      )
      SELECT
        tc.tenant_id,
        tc.id,
        'GOVERNMENT',
        NULL,
        NULL,
        NULL,
        'IVA',
        19,
        true,
        now(),
        NULL,
        tc.tenant_id
      FROM tax_classifications tc
      WHERE tc.code = 'IVA_FULL'
        AND NOT EXISTS (
          SELECT 1
          FROM tax_rules tr
          WHERE tr.tenant_id = tc.tenant_id
            AND tr.tax_classification_id = tc.id
            AND tr.customer_segment = 'GOVERNMENT'
            AND tr.estrato_min IS NULL
            AND tr.estrato_max IS NULL
            AND tr.tax_type = 'IVA'
            AND tr.rate_percentage = 19
            AND tr.is_active = true
        )
    `);
  }
  async down(queryRunner) {
    await queryRunner.query(`
      DELETE FROM tax_rules tr
      USING tax_classifications tc
      WHERE tr.tax_classification_id = tc.id
        AND tr.created_by = tr.tenant_id
        AND tr.tax_type = 'IVA'
        AND (
          (tc.code = 'IVA_EXEMPT' AND tr.customer_segment = 'RESIDENTIAL' AND tr.estrato_min = 1 AND tr.estrato_max = 2 AND tr.rate_percentage = 0)
          OR (tc.code = 'IVA_EXCLUDED' AND tr.customer_segment = 'RESIDENTIAL' AND tr.estrato_min = 3 AND tr.estrato_max = 3 AND tr.rate_percentage = 0)
          OR (tc.code = 'IVA_FULL' AND tr.customer_segment = 'RESIDENTIAL' AND tr.estrato_min = 4 AND tr.estrato_max = 6 AND tr.rate_percentage = 19)
          OR (tc.code = 'IVA_FULL' AND tr.customer_segment = 'CORPORATE' AND tr.estrato_min IS NULL AND tr.estrato_max IS NULL AND tr.rate_percentage = 19)
          OR (tc.code = 'IVA_FULL' AND tr.customer_segment = 'GOVERNMENT' AND tr.estrato_min IS NULL AND tr.estrato_max IS NULL AND tr.rate_percentage = 19)
        )
    `);
  }
}
exports.SeedCommercialDefaultTaxRules1700000000019 = SeedCommercialDefaultTaxRules1700000000019;
//# sourceMappingURL=019_seed_commercial_default_tax_rules.js.map
