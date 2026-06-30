'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.AddOperationalResourceToUsers1749733200044 = void 0;
/**
 * Habilita la capacidad explícita de despacho operativo sobre users.
 *
 * Regla de negocio:
 * - cualquier usuario interno puede ser agendado
 * - solo los usuarios marcados como recurso operativo aparecen en despacho
 *
 * Backfill conservador:
 * - TECHNICIAN y CONTRACTOR quedan operativos por defecto
 * - el resto permanece en false hasta revisión administrativa
 */
class AddOperationalResourceToUsers1749733200044 {
  name = 'AddOperationalResourceToUsers1749733200044';
  async up(queryRunner) {
    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS is_operational_resource BOOLEAN NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      UPDATE users
         SET is_operational_resource = true
       WHERE role IN ('TECHNICIAN', 'CONTRACTOR')
    `);
  }
  async down(queryRunner) {
    await queryRunner.query(`
      ALTER TABLE users
        DROP COLUMN IF EXISTS is_operational_resource
    `);
  }
}
exports.AddOperationalResourceToUsers1749733200044 = AddOperationalResourceToUsers1749733200044;
//# sourceMappingURL=044_add_operational_resource_to_users.js.map
