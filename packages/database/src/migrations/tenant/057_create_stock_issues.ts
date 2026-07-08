import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migracion 057: crea documentos de salida (stock issues) para MOD12.
 *
 * Incluye:
 * - Extensión segura de stock_location_type (OFFICE_STOCK, NODE_STOCK)
 * - Tipos enum: stock_issue_type, stock_issue_status
 * - Tablas: stock_issues, stock_issue_lines (integridad interna MOD12)
 */
export class CreateStockIssues0570000000000 implements MigrationInterface {
  name = 'CreateStockIssues0570000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Extiende enum existente de forma idempotente
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'stock_location_type' AND e.enumlabel = 'OFFICE_STOCK'
        ) THEN
          ALTER TYPE stock_location_type ADD VALUE 'OFFICE_STOCK';
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'stock_location_type' AND e.enumlabel = 'NODE_STOCK'
        ) THEN
          ALTER TYPE stock_location_type ADD VALUE 'NODE_STOCK';
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TYPE stock_issue_type AS ENUM (
        'TECHNICIAN_CUSTODY',
        'CREW_CUSTODY',
        'OFFICE_REPLENISHMENT',
        'NODE_REPLENISHMENT',
        'SALE_DISPATCH',
        'INTERNAL_CONSUMPTION',
        'WAREHOUSE_TO_WAREHOUSE'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE stock_issue_status AS ENUM (
        'DRAFT',
        'REQUESTED',
        'APPROVED',
        'PICKING',
        'READY_TO_DISPATCH',
        'DISPATCHED',
        'RECEIVED',
        'CANCELLED'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE stock_issues (
        id                    UUID              NOT NULL DEFAULT gen_random_uuid(),
        tenant_id             UUID              NOT NULL,
        type                  stock_issue_type  NOT NULL,
        status                stock_issue_status NOT NULL DEFAULT 'DRAFT',
        source_location_id    UUID              NOT NULL,
        destination_location_id UUID,
        destination_ref_id    VARCHAR(160),
        origin_ref_id         VARCHAR(160),
        commercial_ref_id     VARCHAR(160),
        reason                TEXT,
        cost_center           VARCHAR(80),
        handoff_method        VARCHAR(32),
        handoff_notes         TEXT,
        handoff_attachments   JSONB,
        created_by_user_id    UUID,
        dispatched_by_user_id UUID,
        closed_at             TIMESTAMPTZ,
        stock_movement_id     UUID,
        created_at            TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_stock_issues PRIMARY KEY (id),
        CONSTRAINT fk_stock_issues_source_location
          FOREIGN KEY (source_location_id)
          REFERENCES stock_locations (id),
        CONSTRAINT fk_stock_issues_destination_location
          FOREIGN KEY (destination_location_id)
          REFERENCES stock_locations (id),
        CONSTRAINT fk_stock_issues_stock_movement
          FOREIGN KEY (stock_movement_id)
          REFERENCES stock_movements (id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_stock_issues_tenant_status_created_at
        ON stock_issues (tenant_id, status, created_at)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_stock_issues_tenant_type_status
        ON stock_issues (tenant_id, type, status)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_stock_issues_tenant_source_location
        ON stock_issues (tenant_id, source_location_id, created_at)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_stock_issues_tenant_destination_location
        ON stock_issues (tenant_id, destination_location_id, created_at)
    `);

    await queryRunner.query(`
      CREATE TABLE stock_issue_lines (
        id                 UUID                    NOT NULL DEFAULT gen_random_uuid(),
        tenant_id          UUID                    NOT NULL,
        issue_id           UUID                    NOT NULL,
        item_id            UUID                    NOT NULL,
        requested_qty      NUMERIC(12,2)           NOT NULL,
        dispatched_qty     NUMERIC(12,2),
        lot_id             UUID,
        serialized_asset_id UUID,
        condition          stock_balance_condition NOT NULL DEFAULT 'NEW',
        created_at         TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
        updated_at         TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_stock_issue_lines PRIMARY KEY (id),
        CONSTRAINT fk_stock_issue_lines_issue
          FOREIGN KEY (issue_id)
          REFERENCES stock_issues (id)
          ON DELETE CASCADE,
        CONSTRAINT fk_stock_issue_lines_item
          FOREIGN KEY (item_id)
          REFERENCES inventory_items (id),
        CONSTRAINT fk_stock_issue_lines_lot
          FOREIGN KEY (lot_id)
          REFERENCES stock_lots (id),
        CONSTRAINT fk_stock_issue_lines_asset
          FOREIGN KEY (serialized_asset_id)
          REFERENCES serialized_assets (id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_stock_issue_lines_issue
        ON stock_issue_lines (issue_id, created_at)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS stock_issue_lines`);
    await queryRunner.query(`DROP TABLE IF EXISTS stock_issues`);
    await queryRunner.query(`DROP TYPE IF EXISTS stock_issue_status`);
    await queryRunner.query(`DROP TYPE IF EXISTS stock_issue_type`);

    // Revert de stock_location_type: recrea el tipo sin los valores agregados.
    // Si existen filas usando OFFICE_STOCK o NODE_STOCK, esta operación fallará (revert seguro).
    await queryRunner.query(`ALTER TYPE stock_location_type RENAME TO stock_location_type__old057`);

    await queryRunner.query(`
      CREATE TYPE stock_location_type AS ENUM (
        'MAIN_WAREHOUSE',
        'MOBILE_TECHNICIAN',
        'MOBILE_CREW',
        'CUSTOMER_SITE',
        'QUARANTINE',
        'REPAIR',
        'SCRAP',
        'INTERNAL_CONSUMPTION'
      )
    `);

    await queryRunner.query(`
      ALTER TABLE stock_locations
        ALTER COLUMN type TYPE stock_location_type
        USING type::text::stock_location_type
    `);

    await queryRunner.query(`DROP TYPE IF EXISTS stock_location_type__old057`);
  }
}
