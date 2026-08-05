import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración: Persiste notas del coordinador en la revisión de no realización.
 *
 * Schema: tenant (dinámico vía search_path)
 * Reversible: sí
 * ADR-077 D2, MOD09 remediación A3
 */
export class AddScheduleEventReviewNotes106 implements MigrationInterface {
  name = 'AddScheduleEventReviewNotes106';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE schedule_events
      ADD COLUMN IF NOT EXISTS review_notes TEXT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE schedule_events
      DROP COLUMN IF EXISTS review_notes
    `);
  }
}
