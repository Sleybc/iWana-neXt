import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 023: tabla puente tax_rule_applications (MOD06 ↔ MOD07).
 *
 * Vincula reglas de aplicación de CommercialModule con definiciones de impuestos
 * de TaxationModule. Las FKs son lógicas (sin constraints físicas) para
 * respetar el boundary entre bounded contexts.
 *
 * Backfill idempotente: intenta crear filas cruzando tax_rules con tax_definitions
 * donde code = tax_type. Puede no encontrar coincidencias si los presets de
 * Taxation (IVA_19, IVA_EXENTO, etc.) no coinciden con los valores legacy de
 * tax_type ('IVA', 'RETENTION', 'ICA'). En ese caso se omite el registro
 * (no falla la migración).
 *
 * Schema: tenant — search_path resuelto por el runner (sin prefijo explícito).
 * Reversible: sí — down() elimina la tabla.
 *
 * Ref: HLD-MOD06-TAXATION-DEPENDENCY-v1.1-addendum §4, ADR-031 §D5
 */
export class CreateTaxRuleApplications1700000000023 implements MigrationInterface {
  name = 'CreateTaxRuleApplications1700000000023';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── Tabla principal ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tax_rule_applications (
        id              UUID NOT NULL DEFAULT gen_random_uuid(),
        tenant_id       UUID NOT NULL,
        tax_rule_id     UUID NOT NULL,
        tax_definition_id UUID NOT NULL,
        treatment       VARCHAR(20) NOT NULL
          CHECK (treatment IN ('STANDARD', 'EXEMPT', 'EXCLUDED', 'FIXED')),
        rate_override   NUMERIC(5,2),
        priority        SMALLINT NOT NULL DEFAULT 0,
        is_active       BOOLEAN NOT NULL DEFAULT true,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT pk_tax_rule_applications PRIMARY KEY (id)
      )
    `);

    // ─── Índice de búsqueda ─────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_tax_rule_applications_lookup
      ON tax_rule_applications (tenant_id, tax_rule_id, is_active)
    `);

    // ─── Backfill idempotente ───────────────────────────────────────────────
    // Cruza tax_rules activas con tax_definitions donde code = tax_type.
    // Con los valores actuales del enum TaxType ('IVA', 'RETENTION', 'ICA'),
    // es posible que no haya coincidencias con los códigos de preset de Taxation
    // ('IVA_19', 'IVA_EXENTO', etc.). Las filas sin coincidencia se omiten
    // silenciosamente; no se lanza error.
    await queryRunner.query(`
      DO $$
      DECLARE
        r RECORD;
        matched_def_id UUID;
      BEGIN
        FOR r IN
          SELECT tr.id AS rule_id, tr.tenant_id, tr.tax_type, tr.priority
          FROM tax_rules tr
          WHERE tr.is_active = true
        LOOP
          SELECT id INTO matched_def_id
          FROM tax_definitions
          WHERE code = r.tax_type
            AND is_active = true
          LIMIT 1;

          IF matched_def_id IS NULL THEN
            RAISE NOTICE '[023_backfill] tax_type=% no encontrado en tax_definitions — omitido', r.tax_type;
            CONTINUE;
          END IF;

          -- Insertar solo si no existe ya la combinación
          INSERT INTO tax_rule_applications
            (id, tenant_id, tax_rule_id, tax_definition_id, treatment, rate_override, priority, is_active)
          SELECT
            gen_random_uuid(),
            r.tenant_id,
            r.rule_id,
            matched_def_id,
            'STANDARD',
            NULL,
            r.priority,
            true
          WHERE NOT EXISTS (
            SELECT 1 FROM tax_rule_applications tra
            WHERE tra.tax_rule_id = r.rule_id
              AND tra.tax_definition_id = matched_def_id
          );
        END LOOP;
      END;
      $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_tax_rule_applications_lookup`);
    await queryRunner.query(`DROP TABLE IF EXISTS tax_rule_applications`);
  }
}
