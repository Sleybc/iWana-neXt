import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración: Crea la tabla non_realization_causes y el enum de categoría.
 * Los seeds se aplican desde el servicio NonRealizationCausesService al
 * inicializar el módulo WFM.
 *
 * Schema: tenant (dinámico vía search_path)
 * Reversible: sí
 * ADR-077 D1, MOD09-CICLO-VISITA F2.1
 */
export class CreateNonRealizationCauses103 implements MigrationInterface {
  name = 'CreateNonRealizationCauses103';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE non_realization_cause_category_enum AS ENUM (
          'CUSTOMER', 'OPERATIONAL', 'FORCE_MAJEURE'
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS non_realization_causes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        code VARCHAR(50) NOT NULL,
        label VARCHAR(160) NOT NULL,
        category non_realization_cause_category_enum NOT NULL,
        requires_evidence BOOLEAN NOT NULL DEFAULT false,
        pauses_sla BOOLEAN NOT NULL DEFAULT false,
        closes_work BOOLEAN NOT NULL DEFAULT false,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_non_realization_causes_tenant_code
      ON non_realization_causes (tenant_id, code)
      WHERE deleted_at IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS non_realization_causes CASCADE`);
    // No dropeamos el enum — puede estar en uso por otras migraciones posteriores
  }
}
