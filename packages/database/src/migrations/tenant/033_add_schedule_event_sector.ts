import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega sector/vereda a la agenda WFM para recomendaciones territoriales.
 * El campo no es obligatorio para preservar eventos historicos y flujos manuales.
 */
export class AddScheduleEventSector1700000000033 implements MigrationInterface {
  name = 'AddScheduleEventSector1700000000033';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE schedule_events
        ADD COLUMN IF NOT EXISTS sector VARCHAR(120)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_schedule_events_tenant_location
        ON schedule_events (tenant_id, municipality, sector)
        WHERE deleted_at IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_schedule_events_tenant_location`);
    await queryRunner.query(`
      ALTER TABLE schedule_events
        DROP COLUMN IF EXISTS sector
    `);
  }
}
