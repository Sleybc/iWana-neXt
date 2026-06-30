'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.HardenInventoryWriteOffStatus0480000000000 = void 0;
/**
 * Migracion 048: endurece status de bajas de inventario con enum PostgreSQL tipado.
 */
class HardenInventoryWriteOffStatus0480000000000 {
  name = 'HardenInventoryWriteOffStatus0480000000000';
  async up(queryRunner) {
    await queryRunner.query(`
      CREATE TYPE write_off_status AS ENUM (
        'REQUESTED',
        'PENDING_APPROVAL',
        'APPROVED',
        'REJECTED',
        'COMPLETED'
      )
    `);
    await queryRunner.query(`
      ALTER TABLE inventory_write_offs
        ALTER COLUMN status DROP DEFAULT
    `);
    await queryRunner.query(`
      ALTER TABLE inventory_write_offs
        ALTER COLUMN status TYPE write_off_status
        USING status::write_off_status
    `);
    await queryRunner.query(`
      ALTER TABLE inventory_write_offs
        ALTER COLUMN status SET DEFAULT 'REQUESTED'
    `);
  }
  async down(queryRunner) {
    await queryRunner.query(`
      ALTER TABLE inventory_write_offs
        ALTER COLUMN status DROP DEFAULT
    `);
    await queryRunner.query(`
      ALTER TABLE inventory_write_offs
        ALTER COLUMN status TYPE VARCHAR(32)
        USING status::text
    `);
    await queryRunner.query(`
      ALTER TABLE inventory_write_offs
        ALTER COLUMN status SET DEFAULT 'REQUESTED'
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS write_off_status`);
  }
}
exports.HardenInventoryWriteOffStatus0480000000000 = HardenInventoryWriteOffStatus0480000000000;
//# sourceMappingURL=048_harden_inventory_write_off_status.js.map
