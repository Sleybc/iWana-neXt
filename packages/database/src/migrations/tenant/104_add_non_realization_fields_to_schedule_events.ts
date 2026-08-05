import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración: Agrega campos de clasificación de causa, doble clasificación
 * y evidencia a schedule_events, y sla_paused_at a visit_requests.
 *
 * Schema: tenant (dinámico vía search_path)
 * Reversible: sí
 * ADR-077 D2, D5, MOD09-CICLO-VISITA F2.2, F2.4, F2.5
 */
export class AddNonRealizationFieldsToScheduleEvents104 implements MigrationInterface {
  name = 'AddNonRealizationFieldsToScheduleEvents104';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // schedule_events: campos de clasificación
    await queryRunner.query(`
      ALTER TABLE schedule_events
      ADD COLUMN IF NOT EXISTS cause_reported_by_id UUID,
      ADD COLUMN IF NOT EXISTS cause_reported_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS cause_reviewed_by_id UUID,
      ADD COLUMN IF NOT EXISTS cause_reviewed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS non_realization_cause_id UUID,
      ADD COLUMN IF NOT EXISTS reviewed_cause_id UUID,
      ADD COLUMN IF NOT EXISTS evidence_submitted BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS failure_reason TEXT
    `);

    // visit_requests: pausa de SLA
    await queryRunner.query(`
      ALTER TABLE visit_requests
      ADD COLUMN IF NOT EXISTS sla_paused_at TIMESTAMPTZ
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE schedule_events
      DROP COLUMN IF EXISTS cause_reported_by_id,
      DROP COLUMN IF EXISTS cause_reported_at,
      DROP COLUMN IF EXISTS cause_reviewed_by_id,
      DROP COLUMN IF EXISTS cause_reviewed_at,
      DROP COLUMN IF EXISTS non_realization_cause_id,
      DROP COLUMN IF EXISTS reviewed_cause_id,
      DROP COLUMN IF EXISTS evidence_submitted,
      DROP COLUMN IF EXISTS failure_reason
    `);

    await queryRunner.query(`
      ALTER TABLE visit_requests
      DROP COLUMN IF EXISTS sla_paused_at
    `);
  }
}
