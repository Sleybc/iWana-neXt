import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 025: deprecación controlada del módulo tributario legacy.
 *
 * up():
 *   - Elimina las columnas legacy estrato_min y estrato_max de tax_rules
 *     (reemplazadas por stratum_from/stratum_to en migración 020).
 *   - Elimina la tabla tax_classifications (motor legacy reemplazado por
 *     TaxDefinition + tax_rule_applications en MOD07).
 *
 * down() (reversible):
 *   - Recrea tax_classifications con la estructura original de migración 017.
 *   - Restaura las columnas estrato_min y estrato_max en tax_rules.
 *
 * Ref: ADR-031 §D6, ADR-032, programa TAXATION-PARTIES F6
 */
export class DeprecateLegacyTaxation1700000000025 implements MigrationInterface {
  name = 'DeprecateLegacyTaxation1700000000025';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Eliminar columnas legacy de estrato de tax_rules
    await queryRunner.query(`
      ALTER TABLE tax_rules DROP COLUMN IF EXISTS estrato_min
    `);
    await queryRunner.query(`
      ALTER TABLE tax_rules DROP COLUMN IF EXISTS estrato_max
    `);

    // Eliminar tabla tax_classifications (motor legacy)
    // CASCADE elimina cualquier constraint FK que referencie tax_classifications.id
    // (incluyendo tax_rules.tax_classification_id si existe como FK explícita).
    // NOTA: las columnas tax_classification_id en tax_rules y catalog_items quedan
    // como columnas plain UUID sin FK — retención intencional para auditoría de datos
    // históricos. Normalizar a tax_definition_id en sprint futuro si se requiere.
    // Ref: ADR-032, revisión AI-EM-ARCH O2.
    await queryRunner.query(`
      DROP TABLE IF EXISTS tax_classifications CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Recrear tax_classifications con estructura original de migración 017
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

    // Restaurar columnas legacy de estrato en tax_rules
    await queryRunner.query(`
      ALTER TABLE tax_rules ADD COLUMN IF NOT EXISTS estrato_min INT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE tax_rules ADD COLUMN IF NOT EXISTS estrato_max INT NULL
    `);
  }
}
