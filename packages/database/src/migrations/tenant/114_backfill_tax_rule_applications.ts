import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SQL idempotente: vincula reglas comerciales `tax_rules` (tax_type legado IVA/RETENTION/ICA)
 * con definiciones MOD07 (`IVA_19`, `IVA_EXENTO`, …). La migración 023 hacía
 * `code = tax_type` y no encontraba coincidencias; el resumen comercial contaba
 * todos los planes activos como hueco de cobertura.
 *
 * Schema: tenant (search_path). Reversible: sí — borra solo vínculos sin override
 * que coincidan con este mapeo.
 */
export const BACKFILL_TAX_RULE_APPLICATIONS_SQL = `
INSERT INTO tax_rule_applications (
  tenant_id,
  tax_rule_id,
  tax_definition_id,
  treatment,
  rate_override,
  priority,
  is_active
)
SELECT
  tr.tenant_id,
  tr.id,
  td.id,
  td.treatment,
  NULL,
  COALESCE(tr.priority, 0),
  true
FROM tax_rules tr
INNER JOIN tax_definitions td
  ON td.deleted_at IS NULL
 AND td.is_active = true
 AND td.code = CASE
    WHEN tr.tax_type = 'IVA' AND tr.rate_percentage >= 19 THEN 'IVA_19'
    WHEN tr.tax_type = 'IVA' AND tr.stratum_from = 3 AND tr.stratum_to = 3 THEN 'IVA_EXCLUIDO'
    WHEN tr.tax_type = 'IVA' THEN 'IVA_EXENTO'
    WHEN tr.tax_type = 'RETENTION' THEN 'RETE_FUENTE_SERVICIOS'
    WHEN tr.tax_type = 'ICA' THEN 'RETE_ICA'
    ELSE NULL
  END
WHERE tr.is_active = true
  AND NOT EXISTS (
    SELECT 1
    FROM tax_rule_applications existing
    WHERE existing.tax_rule_id = tr.id
      AND existing.tax_definition_id = td.id
  )
`;

const REVERT_BACKFILL_TAX_RULE_APPLICATIONS_SQL = `
DELETE FROM tax_rule_applications tra
USING tax_rules tr, tax_definitions td
WHERE tra.tax_rule_id = tr.id
  AND tra.tax_definition_id = td.id
  AND tra.rate_override IS NULL
  AND td.code = CASE
    WHEN tr.tax_type = 'IVA' AND tr.rate_percentage >= 19 THEN 'IVA_19'
    WHEN tr.tax_type = 'IVA' AND tr.stratum_from = 3 AND tr.stratum_to = 3 THEN 'IVA_EXCLUIDO'
    WHEN tr.tax_type = 'IVA' THEN 'IVA_EXENTO'
    WHEN tr.tax_type = 'RETENTION' THEN 'RETE_FUENTE_SERVICIOS'
    WHEN tr.tax_type = 'ICA' THEN 'RETE_ICA'
    ELSE NULL
  END
`;

export class BackfillTaxRuleApplications1140000000000 implements MigrationInterface {
  name = 'BackfillTaxRuleApplications1140000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(BACKFILL_TAX_RULE_APPLICATIONS_SQL);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(REVERT_BACKFILL_TAX_RULE_APPLICATIONS_SQL);
  }
}
