import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migracion 049: workspace hibrido de compras — lineas, adjudicaciones y refinamiento de cabecera.
 */
export class RefineInventoryPurchasingWorkspace0490000000000 implements MigrationInterface {
  name = 'RefineInventoryPurchasingWorkspace0490000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE purchase_request_type AS ENUM (
        'REPLENISHMENT',
        'URGENT_OPERATION',
        'PROJECT',
        'FREE_PURCHASE'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE purchase_request_priority AS ENUM (
        'LOW',
        'NORMAL',
        'HIGH',
        'URGENT'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE purchase_request_line_source_kind AS ENUM (
        'INVENTORY_ITEM',
        'REPLENISHMENT_SUGGESTION',
        'FREE_TEXT'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE purchase_request_line_status AS ENUM (
        'OPEN',
        'PENDING_QUOTE',
        'AWARDED',
        'ORDERED',
        'PARTIALLY_RECEIVED',
        'RECEIVED',
        'CANCELLED',
        'REJECTED'
      )
    `);

    await queryRunner.query(`
      ALTER TABLE purchase_requests
        ADD COLUMN request_type purchase_request_type NOT NULL DEFAULT 'REPLENISHMENT',
        ADD COLUMN priority purchase_request_priority NOT NULL DEFAULT 'NORMAL',
        ADD COLUMN requesting_area VARCHAR(120),
        ADD COLUMN justification TEXT,
        ADD COLUMN operational_ref_type VARCHAR(60),
        ADD COLUMN operational_ref_id VARCHAR(160),
        ADD COLUMN exception_reason TEXT,
        ADD COLUMN approved_by_user_id UUID
    `);

    await queryRunner.query(`
      CREATE INDEX idx_purchase_requests_tenant_type_priority
        ON purchase_requests (tenant_id, request_type, priority)
    `);

    await queryRunner.query(`
      CREATE TABLE purchase_request_lines (
        id                      UUID                              NOT NULL DEFAULT gen_random_uuid(),
        tenant_id               UUID                              NOT NULL,
        purchase_request_id     UUID                              NOT NULL,
        source_kind             purchase_request_line_source_kind NOT NULL,
        inventory_item_id       UUID,
        free_text_description   VARCHAR(500),
        quantity_requested      NUMERIC(12,2)                     NOT NULL,
        unit_of_measure         VARCHAR(32)                       NOT NULL,
        suggested_party_ref_id  UUID,
        line_status             purchase_request_line_status      NOT NULL DEFAULT 'OPEN',
        notes                   TEXT,
        created_at              TIMESTAMPTZ                       NOT NULL DEFAULT NOW(),
        updated_at              TIMESTAMPTZ                       NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_purchase_request_lines PRIMARY KEY (id),
        CONSTRAINT fk_purchase_request_lines_request
          FOREIGN KEY (purchase_request_id)
          REFERENCES purchase_requests (id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_purchase_request_lines_tenant_request
        ON purchase_request_lines (tenant_id, purchase_request_id)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_purchase_request_lines_tenant_status
        ON purchase_request_lines (tenant_id, line_status)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_purchase_request_lines_tenant_item
        ON purchase_request_lines (tenant_id, inventory_item_id)
    `);

    await queryRunner.query(`
      CREATE TABLE purchase_request_line_awards (
        id                        UUID           NOT NULL DEFAULT gen_random_uuid(),
        tenant_id                 UUID           NOT NULL,
        purchase_request_line_id  UUID           NOT NULL,
        supplier_quote_id         UUID,
        awarded_party_ref_id      UUID           NOT NULL,
        awarded_quantity          NUMERIC(12,2)  NOT NULL,
        award_notes               TEXT,
        created_at                TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
        updated_at                TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_purchase_request_line_awards PRIMARY KEY (id),
        CONSTRAINT fk_purchase_request_line_awards_line
          FOREIGN KEY (purchase_request_line_id)
          REFERENCES purchase_request_lines (id),
        CONSTRAINT fk_purchase_request_line_awards_quote
          FOREIGN KEY (supplier_quote_id)
          REFERENCES supplier_quotes (id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_purchase_request_line_awards_tenant_line
        ON purchase_request_line_awards (tenant_id, purchase_request_line_id)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_purchase_request_line_awards_tenant_party
        ON purchase_request_line_awards (tenant_id, awarded_party_ref_id)
    `);

    await queryRunner.query(`
      ALTER TABLE purchase_order_lines
        ADD COLUMN purchase_request_line_id UUID
    `);

    await queryRunner.query(`
      CREATE INDEX idx_purchase_order_lines_tenant_request_line
        ON purchase_order_lines (tenant_id, purchase_request_line_id)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_supplier_quotes_tenant_request_party
        ON supplier_quotes (tenant_id, purchase_request_id, party_ref_id)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_supplier_quotes_tenant_valid_until
        ON supplier_quotes (tenant_id, valid_until)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_supplier_quotes_tenant_valid_until`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_supplier_quotes_tenant_request_party`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_purchase_order_lines_tenant_request_line`);

    await queryRunner.query(`
      ALTER TABLE purchase_order_lines
        DROP COLUMN IF EXISTS purchase_request_line_id
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS idx_purchase_request_line_awards_tenant_party`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_purchase_request_line_awards_tenant_line`);
    await queryRunner.query(`DROP TABLE IF EXISTS purchase_request_line_awards`);

    await queryRunner.query(`DROP INDEX IF EXISTS idx_purchase_request_lines_tenant_item`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_purchase_request_lines_tenant_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_purchase_request_lines_tenant_request`);
    await queryRunner.query(`DROP TABLE IF EXISTS purchase_request_lines`);

    await queryRunner.query(`DROP INDEX IF EXISTS idx_purchase_requests_tenant_type_priority`);

    await queryRunner.query(`
      ALTER TABLE purchase_requests
        DROP COLUMN IF EXISTS approved_by_user_id,
        DROP COLUMN IF EXISTS exception_reason,
        DROP COLUMN IF EXISTS operational_ref_id,
        DROP COLUMN IF EXISTS operational_ref_type,
        DROP COLUMN IF EXISTS justification,
        DROP COLUMN IF EXISTS requesting_area,
        DROP COLUMN IF EXISTS priority,
        DROP COLUMN IF EXISTS request_type
    `);

    await queryRunner.query(`DROP TYPE IF EXISTS purchase_request_line_status`);
    await queryRunner.query(`DROP TYPE IF EXISTS purchase_request_line_source_kind`);
    await queryRunner.query(`DROP TYPE IF EXISTS purchase_request_priority`);
    await queryRunner.query(`DROP TYPE IF EXISTS purchase_request_type`);
  }
}
