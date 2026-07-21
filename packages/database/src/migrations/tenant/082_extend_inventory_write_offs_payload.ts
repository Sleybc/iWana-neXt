import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 082 — MOD12 Bajas con aprobación Fase H3.
 *
 * Congela payload operativo en inventory_write_offs hasta la aprobación.
 */
export class ExtendInventoryWriteOffsPayload0820000000000 implements MigrationInterface {
  name = 'ExtendInventoryWriteOffsPayload0820000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE inventory_write_offs
        ADD COLUMN IF NOT EXISTS location_id UUID,
        ADD COLUMN IF NOT EXISTS quantity NUMERIC(18, 4) NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(160),
        ADD COLUMN IF NOT EXISTS rejected_by_user_id UUID,
        ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS rejection_notes TEXT
    `);

    await queryRunner.query(`
      ALTER TABLE inventory_write_offs
        ALTER COLUMN location_id SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE inventory_write_offs
        DROP CONSTRAINT IF EXISTS fk_inventory_write_offs_location
    `);

    await queryRunner.query(`
      ALTER TABLE inventory_write_offs
        ADD CONSTRAINT fk_inventory_write_offs_location
          FOREIGN KEY (location_id)
          REFERENCES stock_locations (id)
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_write_offs_tenant_idempotency_active
        ON inventory_write_offs (tenant_id, idempotency_key)
        WHERE idempotency_key IS NOT NULL
          AND status NOT IN ('COMPLETED', 'REJECTED')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS uq_inventory_write_offs_tenant_idempotency_active
    `);

    await queryRunner.query(`
      ALTER TABLE inventory_write_offs
        DROP CONSTRAINT IF EXISTS fk_inventory_write_offs_location
    `);

    await queryRunner.query(`
      ALTER TABLE inventory_write_offs
        DROP COLUMN IF EXISTS rejection_notes,
        DROP COLUMN IF EXISTS rejected_at,
        DROP COLUMN IF EXISTS rejected_by_user_id,
        DROP COLUMN IF EXISTS idempotency_key,
        DROP COLUMN IF EXISTS quantity,
        DROP COLUMN IF EXISTS location_id
    `);
  }
}
