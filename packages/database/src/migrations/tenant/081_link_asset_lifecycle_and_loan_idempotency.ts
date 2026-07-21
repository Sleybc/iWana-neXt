import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 081 — MOD12 Activos Fase 05 (cierre deuda G5-05A-01 / G5-05B-01).
 *
 * - Enlaza eventos de ciclo de vida al movimiento de ledger que los originó.
 * - Endurece idempotencia de comodato con índice único parcial por movimiento.
 */
export class LinkAssetLifecycleAndLoanIdempotency0810000000000 implements MigrationInterface {
  name = 'LinkAssetLifecycleAndLoanIdempotency0810000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE asset_lifecycle_events
        ADD COLUMN IF NOT EXISTS stock_movement_id UUID NULL
    `);

    await queryRunner.query(`
      ALTER TABLE asset_lifecycle_events
        DROP CONSTRAINT IF EXISTS fk_asset_lifecycle_events_movement
    `);

    await queryRunner.query(`
      ALTER TABLE asset_lifecycle_events
        ADD CONSTRAINT fk_asset_lifecycle_events_movement
          FOREIGN KEY (stock_movement_id)
          REFERENCES stock_movements (id)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_asset_lifecycle_events_movement
        ON asset_lifecycle_events (stock_movement_id)
        WHERE stock_movement_id IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_asset_loan_assignments_tenant_movement
        ON asset_loan_assignments (tenant_id, stock_movement_id)
        WHERE stock_movement_id IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS uq_asset_loan_assignments_tenant_movement
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_asset_lifecycle_events_movement
    `);

    await queryRunner.query(`
      ALTER TABLE asset_lifecycle_events
        DROP CONSTRAINT IF EXISTS fk_asset_lifecycle_events_movement
    `);

    await queryRunner.query(`
      ALTER TABLE asset_lifecycle_events
        DROP COLUMN IF EXISTS stock_movement_id
    `);
  }
}
