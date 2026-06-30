'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.AddScheduleEventSector1700000000033 = void 0;
/**
 * Agrega sector/vereda a la agenda WFM para recomendaciones territoriales.
 * El campo no es obligatorio para preservar eventos historicos y flujos manuales.
 */
class AddScheduleEventSector1700000000033 {
  name = 'AddScheduleEventSector1700000000033';
  async up(queryRunner) {
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
  async down(queryRunner) {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_schedule_events_tenant_location`);
    await queryRunner.query(`
      ALTER TABLE schedule_events
        DROP COLUMN IF EXISTS sector
    `);
  }
}
exports.AddScheduleEventSector1700000000033 = AddScheduleEventSector1700000000033;
//# sourceMappingURL=033_add_schedule_event_sector.js.map
