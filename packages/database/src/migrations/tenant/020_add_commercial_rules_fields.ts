import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 020: extiende las tablas de reglas comerciales con campos del diseño aprobado.
 *
 * catalog_compatibility_rules:
 *   - effective_from DATE: desde cuándo aplica la sugerencia al cotizar
 *   - note TEXT: mensaje visible al agente (sustituye/complementa description)
 *   - updated_at TIMESTAMPTZ: trazabilidad de cambios
 *   - UNIQUE (source_item_id) WHERE is_active = true: un ítem → un sucesor activo
 *
 * tax_classifications:
 *   - applies_iva BOOLEAN: el ítem está sujeto a IVA
 *   - applies_retefuente BOOLEAN: aplica retención en la fuente
 *   - applies_rete_ica BOOLEAN: aplica ReteICA
 *   - applies_estampillas BOOLEAN: aplica estampillas
 *   - is_system BOOLEAN: clasificaciones base no eliminables por UI
 *
 * tax_rules:
 *   - stratum_from SMALLINT: estrato mínimo (inclusive), null = sin restricción
 *   - stratum_to SMALLINT: estrato máximo (inclusive), null = sin restricción
 *   - priority SMALLINT: mayor número = mayor precedencia al resolver solapamientos
 *
 * Schema: tenant (search_path resuelto por TenantContext — sin prefijo)
 * Reversible: sí
 */
export class AddCommercialRulesFields1700000000020 implements MigrationInterface {
  name = 'AddCommercialRulesFields1700000000020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── catalog_compatibility_rules ──────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE catalog_compatibility_rules
        ADD COLUMN IF NOT EXISTS effective_from DATE,
        ADD COLUMN IF NOT EXISTS note TEXT,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    `);

    // Índice único parcial: un ítem obsoleto solo puede tener un sucesor activo a la vez
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_compat_one_active_successor
      ON catalog_compatibility_rules (source_item_id)
      WHERE is_active = true
    `);

    // ─── tax_classifications ───────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE tax_classifications
        ADD COLUMN IF NOT EXISTS applies_iva BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS applies_retefuente BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS applies_rete_ica BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS applies_estampillas BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false
    `);

    // ─── tax_rules ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE tax_rules
        ADD COLUMN IF NOT EXISTS stratum_from SMALLINT,
        ADD COLUMN IF NOT EXISTS stratum_to SMALLINT,
        ADD COLUMN IF NOT EXISTS priority SMALLINT NOT NULL DEFAULT 0
    `);

    // Poblar stratum_from/stratum_to desde estrato_min/estrato_max existentes
    await queryRunner.query(`
      UPDATE tax_rules
      SET
        stratum_from = estrato_min,
        stratum_to   = estrato_max
      WHERE stratum_from IS NULL AND estrato_min IS NOT NULL
    `);

    // Seed: marcar las clasificaciones base del sistema como is_system = true.
    // Las 4 clasificaciones base (IVA_EXEMPT, IVA_EXCLUDED, IVA_FULL, GOV_FULL) fueron
    // creadas por el TenantProvisioningService. Las marcamos por código.
    // También actualizar los flags booleanos según el marco tributario colombiano.
    await queryRunner.query(`
      UPDATE tax_classifications
      SET
        applies_iva          = false,
        applies_retefuente   = false,
        applies_rete_ica     = false,
        applies_estampillas  = false,
        is_system            = true
      WHERE code = 'IVA_EXEMPT'
    `);

    await queryRunner.query(`
      UPDATE tax_classifications
      SET
        applies_iva          = false,
        applies_retefuente   = false,
        applies_rete_ica     = false,
        applies_estampillas  = false,
        is_system            = true
      WHERE code = 'IVA_EXCLUDED'
    `);

    await queryRunner.query(`
      UPDATE tax_classifications
      SET
        applies_iva          = true,
        applies_retefuente   = true,
        applies_rete_ica     = false,
        applies_estampillas  = false,
        is_system            = true
      WHERE code = 'IVA_FULL'
    `);

    await queryRunner.query(`
      UPDATE tax_classifications
      SET
        applies_iva          = true,
        applies_retefuente   = true,
        applies_rete_ica     = true,
        applies_estampillas  = true,
        is_system            = true
      WHERE code = 'GOV_FULL'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_compat_one_active_successor`);
    await queryRunner.query(`
      ALTER TABLE catalog_compatibility_rules
        DROP COLUMN IF EXISTS effective_from,
        DROP COLUMN IF EXISTS note,
        DROP COLUMN IF EXISTS updated_at
    `);
    await queryRunner.query(`
      ALTER TABLE tax_classifications
        DROP COLUMN IF EXISTS applies_iva,
        DROP COLUMN IF EXISTS applies_retefuente,
        DROP COLUMN IF EXISTS applies_rete_ica,
        DROP COLUMN IF EXISTS applies_estampillas,
        DROP COLUMN IF EXISTS is_system
    `);
    await queryRunner.query(`
      ALTER TABLE tax_rules
        DROP COLUMN IF EXISTS stratum_from,
        DROP COLUMN IF EXISTS stratum_to,
        DROP COLUMN IF EXISTS priority
    `);
  }
}
