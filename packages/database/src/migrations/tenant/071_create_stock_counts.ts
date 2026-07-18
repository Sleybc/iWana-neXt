import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 071: documentos de conteo físico (stock counts) para MOD12 Existencias Fase 03A.
 *
 * Incluye:
 * - Enum stock_count_status
 * - Tablas stock_counts y stock_count_lines (integridad interna MOD12)
 */
export class CreateStockCounts0710000000000 implements MigrationInterface {
  name = 'CreateStockCounts0710000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stock_count_status') THEN
          CREATE TYPE stock_count_status AS ENUM (
            'OPEN',
            'COUNTING',
            'CLOSED',
            'CANCELLED'
          );
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE stock_counts (
        id                   UUID               NOT NULL DEFAULT gen_random_uuid(),
        tenant_id            UUID               NOT NULL,
        count_number         VARCHAR(40)        NOT NULL,
        status               stock_count_status NOT NULL DEFAULT 'OPEN',
        location_id          UUID               NOT NULL,
        category_id          UUID,
        notes                TEXT,
        created_by_user_id   UUID               NOT NULL,
        closed_by_user_id    UUID,
        closed_at            TIMESTAMPTZ,
        stock_movement_id    UUID,
        created_at           TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
        updated_at           TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_stock_counts PRIMARY KEY (id),
        CONSTRAINT uq_stock_counts_tenant_count_number UNIQUE (tenant_id, count_number),
        CONSTRAINT fk_stock_counts_location
          FOREIGN KEY (location_id)
          REFERENCES stock_locations (id),
        CONSTRAINT fk_stock_counts_stock_movement
          FOREIGN KEY (stock_movement_id)
          REFERENCES stock_movements (id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_stock_counts_tenant_status_created_at
        ON stock_counts (tenant_id, status, created_at)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_stock_counts_tenant_location
        ON stock_counts (tenant_id, location_id)
    `);

    await queryRunner.query(`
      CREATE TABLE stock_count_lines (
        id            UUID                    NOT NULL DEFAULT gen_random_uuid(),
        tenant_id     UUID                    NOT NULL,
        count_id      UUID                    NOT NULL,
        item_id       UUID                    NOT NULL,
        lot_id        UUID,
        condition     stock_balance_condition NOT NULL DEFAULT 'NEW',
        expected_qty  NUMERIC(12,2)           NOT NULL,
        counted_qty   NUMERIC(12,2),
        created_at    TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_stock_count_lines PRIMARY KEY (id),
        CONSTRAINT fk_stock_count_lines_count
          FOREIGN KEY (count_id)
          REFERENCES stock_counts (id)
          ON DELETE CASCADE,
        CONSTRAINT fk_stock_count_lines_item
          FOREIGN KEY (item_id)
          REFERENCES inventory_items (id),
        CONSTRAINT fk_stock_count_lines_lot
          FOREIGN KEY (lot_id)
          REFERENCES stock_lots (id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_stock_count_lines_count
        ON stock_count_lines (count_id, created_at)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS stock_count_lines`);
    await queryRunner.query(`DROP TABLE IF EXISTS stock_counts`);
    await queryRunner.query(`DROP TYPE IF EXISTS stock_count_status`);
  }
}
