import { MigrationInterface, QueryRunner } from 'typeorm';
import { BACKFILL_TAX_RULE_APPLICATIONS_SQL } from './114_backfill_tax_rule_applications';

/**
 * Migración 115 — siembra reglas IVA base cuando el tenant no las tiene
 * (019 dependía de `tax_classifications`, eliminada en 025) y vuelve a correr
 * el backfill de `tax_rule_applications`.
 *
 * Schema: tenant (search_path). Reversible: sí.
 */
const SEED_DEFAULT_IVA_TAX_RULES_SQL = `
INSERT INTO tax_rules (
  tenant_id,
  tax_classification_id,
  customer_segment,
  municipality_code,
  tax_type,
  rate_percentage,
  is_active,
  valid_from,
  valid_to,
  created_by,
  stratum_from,
  stratum_to,
  priority
)
SELECT
  t.id,
  NULL,
  v.customer_segment,
  NULL,
  'IVA',
  v.rate,
  true,
  now(),
  NULL,
  t.id,
  v.stratum_from,
  v.stratum_to,
  0
FROM public.tenants t
CROSS JOIN (
  VALUES
    ('RESIDENTIAL'::varchar, 0::numeric, 1::smallint, 2::smallint),
    ('RESIDENTIAL'::varchar, 0::numeric, 3::smallint, 3::smallint),
    ('RESIDENTIAL'::varchar, 19::numeric, 4::smallint, 6::smallint),
    ('CORPORATE'::varchar, 19::numeric, NULL::smallint, NULL::smallint),
    ('GOVERNMENT'::varchar, 19::numeric, NULL::smallint, NULL::smallint)
) AS v(customer_segment, rate, stratum_from, stratum_to)
WHERE t.schema_name = current_schema()
  AND NOT EXISTS (
    SELECT 1
    FROM tax_rules tr
    WHERE tr.tenant_id = t.id
      AND tr.tax_type = 'IVA'
      AND tr.customer_segment = v.customer_segment
      AND tr.rate_percentage = v.rate
      AND tr.is_active = true
      AND tr.stratum_from IS NOT DISTINCT FROM v.stratum_from
      AND tr.stratum_to IS NOT DISTINCT FROM v.stratum_to
  )
`;

const DELETE_SEEDED_IVA_TAX_RULES_SQL = `
DELETE FROM tax_rule_applications tra
USING tax_rules tr
WHERE tra.tax_rule_id = tr.id
  AND tr.created_by = tr.tenant_id
  AND tr.tax_type = 'IVA'
  AND tr.tax_classification_id IS NULL;

DELETE FROM tax_rules tr
WHERE tr.created_by = tr.tenant_id
  AND tr.tax_type = 'IVA'
  AND tr.tax_classification_id IS NULL
  AND (
    (tr.customer_segment = 'RESIDENTIAL' AND tr.stratum_from = 1 AND tr.stratum_to = 2 AND tr.rate_percentage = 0)
    OR (tr.customer_segment = 'RESIDENTIAL' AND tr.stratum_from = 3 AND tr.stratum_to = 3 AND tr.rate_percentage = 0)
    OR (tr.customer_segment = 'RESIDENTIAL' AND tr.stratum_from = 4 AND tr.stratum_to = 6 AND tr.rate_percentage = 19)
    OR (tr.customer_segment = 'CORPORATE' AND tr.stratum_from IS NULL AND tr.stratum_to IS NULL AND tr.rate_percentage = 19)
    OR (tr.customer_segment = 'GOVERNMENT' AND tr.stratum_from IS NULL AND tr.stratum_to IS NULL AND tr.rate_percentage = 19)
  )
`;

export class SeedDefaultIvaTaxRules1150000000000 implements MigrationInterface {
  name = 'SeedDefaultIvaTaxRules1150000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(SEED_DEFAULT_IVA_TAX_RULES_SQL);
    await queryRunner.query(BACKFILL_TAX_RULE_APPLICATIONS_SQL);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(DELETE_SEEDED_IVA_TAX_RULES_SQL);
  }
}
