'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.CreateInventoryScmModule0470000000000 = void 0;
/**
 * Migracion 047: crea entidades base de inventario y SCM para MOD12.
 * Scope: schema tenant, con integridad interna solo entre tablas MOD12.
 */
class CreateInventoryScmModule0470000000000 {
  name = 'CreateInventoryScmModule0470000000000';
  async up(queryRunner) {
    await queryRunner.query(`
      CREATE TYPE inventory_tracking_mode AS ENUM (
        'CONSUMABLE',
        'SERIALIZED',
        'FIXED_ASSET'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE inventory_item_category AS ENUM (
        'CPE',
        'NETWORKING',
        'MATERIALS',
        'TOOLS',
        'CONSUMABLES',
        'OTHER'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE inventory_item_status AS ENUM (
        'ACTIVE',
        'INACTIVE',
        'DISCONTINUED'
      )
    `);
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
      CREATE TYPE stock_location_status AS ENUM (
        'ACTIVE',
        'INACTIVE',
        'ARCHIVED'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE stock_balance_condition AS ENUM (
        'NEW',
        'REFURBISHED',
        'DAMAGED'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE inventory_responsible_type AS ENUM (
        'WAREHOUSE',
        'TECHNICIAN',
        'CREW',
        'CUSTOMER',
        'NONE'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE serialized_asset_status AS ENUM (
        'ORDERED',
        'IN_RECEIVING',
        'AVAILABLE',
        'ASSIGNED_TO_TECHNICIAN',
        'INSTALLED_COMODATO',
        'SOLD',
        'INTERNAL_CONSUMED',
        'IN_TRANSIT',
        'IN_TESTING',
        'AVAILABLE_REFURBISHED',
        'IN_REPAIR',
        'WRITTEN_OFF',
        'LOST'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE stock_movement_origin AS ENUM (
        'PURCHASE_RECEIPT',
        'TRANSFER',
        'EXECUTION_ORDER',
        'SALE',
        'INTERNAL_CONSUMPTION',
        'RETURN',
        'REFURBISH',
        'ADJUSTMENT',
        'WRITE_OFF'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE purchase_request_status AS ENUM (
        'DRAFT',
        'PENDING_QUOTES',
        'PENDING_APPROVAL',
        'APPROVED',
        'REJECTED',
        'CANCELLED',
        'CONVERTED_TO_PO'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE purchase_order_status AS ENUM (
        'DRAFT',
        'PENDING_APPROVAL',
        'APPROVED',
        'PARTIALLY_RECEIVED',
        'FULLY_RECEIVED',
        'CANCELLED',
        'CLOSED'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE goods_receipt_status AS ENUM (
        'DRAFT',
        'IN_PROGRESS',
        'COMPLETED',
        'REJECTED',
        'CANCELLED'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE asset_lifecycle_event_type AS ENUM (
        'RECEIVED',
        'TRANSFERRED',
        'INSTALLED',
        'RETURNED',
        'REPAIRED',
        'REFURBISHED',
        'SOLD',
        'CONSUMED',
        'WRITTEN_OFF',
        'STATUS_CHANGED'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE write_off_reason AS ENUM (
        'DAMAGED',
        'OBSOLETE',
        'LOST',
        'STOLEN',
        'EXPIRED',
        'OTHER'
      )
    `);
    await queryRunner.query(`
      CREATE TABLE inventory_items (
        id                  UUID                     NOT NULL DEFAULT gen_random_uuid(),
        tenant_id           UUID                     NOT NULL,
        sku                 VARCHAR(60)              NOT NULL,
        name                VARCHAR(200)             NOT NULL,
        category            inventory_item_category  NOT NULL,
        tracking_mode       inventory_tracking_mode  NOT NULL,
        unit_of_measure     VARCHAR(32)              NOT NULL,
        base_cost           NUMERIC(14,2)            NOT NULL DEFAULT 0,
        minimum_stock       NUMERIC(12,2)            NOT NULL DEFAULT 0,
        useful_life_months  INTEGER,
        status              inventory_item_status    NOT NULL DEFAULT 'ACTIVE',
        created_at          TIMESTAMPTZ              NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ              NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_inventory_items PRIMARY KEY (id)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_inventory_items_tenant_sku
        ON inventory_items (tenant_id, sku)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_inventory_items_tenant_category_status
        ON inventory_items (tenant_id, category, status)
    `);
    await queryRunner.query(`
      CREATE TABLE stock_locations (
        id                  UUID                   NOT NULL DEFAULT gen_random_uuid(),
        tenant_id           UUID                   NOT NULL,
        code                VARCHAR(60)            NOT NULL,
        name                VARCHAR(200)           NOT NULL,
        type                stock_location_type    NOT NULL,
        status              stock_location_status  NOT NULL DEFAULT 'ACTIVE',
        responsible_ref_id  UUID,
        max_capacity        NUMERIC(12,2),
        created_at          TIMESTAMPTZ            NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ            NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_stock_locations PRIMARY KEY (id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_stock_locations_tenant_type_status
        ON stock_locations (tenant_id, type, status)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_stock_locations_active_mobile_responsible
        ON stock_locations (tenant_id, responsible_ref_id)
        WHERE responsible_ref_id IS NOT NULL
          AND "type" IN ('MOBILE_TECHNICIAN', 'MOBILE_CREW')
          AND "status" = 'ACTIVE'
    `);
    await queryRunner.query(`
      CREATE TABLE purchase_requests (
        id                    UUID                     NOT NULL DEFAULT gen_random_uuid(),
        tenant_id             UUID                     NOT NULL,
        request_number        VARCHAR(40)              NOT NULL,
        title                 VARCHAR(200)             NOT NULL,
        status                purchase_request_status  NOT NULL DEFAULT 'DRAFT',
        requested_by_user_id  UUID                     NOT NULL,
        needed_by_date        DATE,
        notes                 TEXT,
        created_at            TIMESTAMPTZ              NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMPTZ              NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_purchase_requests PRIMARY KEY (id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_purchase_requests_tenant_status
        ON purchase_requests (tenant_id, status)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_purchase_requests_tenant_needed_by
        ON purchase_requests (tenant_id, needed_by_date)
    `);
    await queryRunner.query(`
      CREATE TABLE supplier_quotes (
        id                   UUID           NOT NULL DEFAULT gen_random_uuid(),
        tenant_id            UUID           NOT NULL,
        purchase_request_id  UUID           NOT NULL,
        party_ref_id         UUID           NOT NULL,
        quote_number         VARCHAR(60)    NOT NULL,
        amount               NUMERIC(14,2)  NOT NULL,
        currency             VARCHAR(3)     NOT NULL,
        valid_until          DATE,
        notes                TEXT,
        created_at           TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
        updated_at           TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_supplier_quotes PRIMARY KEY (id),
        CONSTRAINT fk_supplier_quotes_request
          FOREIGN KEY (purchase_request_id)
          REFERENCES purchase_requests (id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_supplier_quotes_request
        ON supplier_quotes (purchase_request_id, valid_until)
    `);
    await queryRunner.query(`
      CREATE TABLE purchase_orders (
        id                      UUID                   NOT NULL DEFAULT gen_random_uuid(),
        tenant_id               UUID                   NOT NULL,
        order_number            VARCHAR(40)            NOT NULL,
        purchase_request_id     UUID,
        party_ref_id            UUID                   NOT NULL,
        status                  purchase_order_status  NOT NULL DEFAULT 'DRAFT',
        expected_delivery_date  DATE,
        approved_by_user_id     UUID,
        notes                   TEXT,
        created_at              TIMESTAMPTZ            NOT NULL DEFAULT NOW(),
        updated_at              TIMESTAMPTZ            NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_purchase_orders PRIMARY KEY (id),
        CONSTRAINT fk_purchase_orders_request
          FOREIGN KEY (purchase_request_id)
          REFERENCES purchase_requests (id)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_purchase_orders_tenant_order_number
        ON purchase_orders (tenant_id, order_number)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_purchase_orders_tenant_supplier
        ON purchase_orders (tenant_id, party_ref_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_purchase_orders_tenant_status
        ON purchase_orders (tenant_id, status)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_purchase_orders_tenant_expected_delivery
        ON purchase_orders (tenant_id, expected_delivery_date)
    `);
    await queryRunner.query(`
      CREATE TABLE purchase_order_lines (
        id                 UUID           NOT NULL DEFAULT gen_random_uuid(),
        tenant_id          UUID           NOT NULL,
        purchase_order_id  UUID           NOT NULL,
        item_id            UUID           NOT NULL,
        quantity           NUMERIC(12,2)  NOT NULL,
        unit_cost          NUMERIC(14,2)  NOT NULL,
        received_quantity  NUMERIC(12,2)  NOT NULL DEFAULT 0,
        created_at         TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
        updated_at         TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_purchase_order_lines PRIMARY KEY (id),
        CONSTRAINT fk_purchase_order_lines_order
          FOREIGN KEY (purchase_order_id)
          REFERENCES purchase_orders (id),
        CONSTRAINT fk_purchase_order_lines_item
          FOREIGN KEY (item_id)
          REFERENCES inventory_items (id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_purchase_order_lines_order
        ON purchase_order_lines (purchase_order_id, created_at)
    `);
    await queryRunner.query(`
      CREATE TABLE goods_receipts (
        id                   UUID                  NOT NULL DEFAULT gen_random_uuid(),
        tenant_id            UUID                  NOT NULL,
        receipt_number       VARCHAR(40)           NOT NULL,
        purchase_order_id    UUID                  NOT NULL,
        status               goods_receipt_status  NOT NULL DEFAULT 'DRAFT',
        received_at          TIMESTAMPTZ           NOT NULL,
        received_by_user_id  UUID,
        notes                TEXT,
        created_at           TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
        updated_at           TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_goods_receipts PRIMARY KEY (id),
        CONSTRAINT fk_goods_receipts_order
          FOREIGN KEY (purchase_order_id)
          REFERENCES purchase_orders (id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_goods_receipts_tenant_po_date
        ON goods_receipts (tenant_id, purchase_order_id, received_at)
    `);
    await queryRunner.query(`
      CREATE TABLE stock_lots (
        id                UUID         NOT NULL DEFAULT gen_random_uuid(),
        tenant_id         UUID         NOT NULL,
        item_id           UUID         NOT NULL,
        lot_number        VARCHAR(80)  NOT NULL,
        expiry_date       DATE,
        goods_receipt_id  UUID,
        created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_stock_lots PRIMARY KEY (id),
        CONSTRAINT fk_stock_lots_item
          FOREIGN KEY (item_id)
          REFERENCES inventory_items (id),
        CONSTRAINT fk_stock_lots_goods_receipt
          FOREIGN KEY (goods_receipt_id)
          REFERENCES goods_receipts (id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_stock_lots_tenant_item_lot
        ON stock_lots (tenant_id, item_id, lot_number)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_stock_lots_tenant_expiry
        ON stock_lots (tenant_id, expiry_date)
    `);
    await queryRunner.query(`
      CREATE TABLE serialized_assets (
        id                         UUID                      NOT NULL DEFAULT gen_random_uuid(),
        tenant_id                  UUID                      NOT NULL,
        inventory_item_id          UUID                      NOT NULL,
        serial_number              VARCHAR(160),
        normalized_serial_number   VARCHAR(160),
        mac_address                VARCHAR(64),
        normalized_mac_address     VARCHAR(64),
        asset_tag                  VARCHAR(120),
        current_status             serialized_asset_status   NOT NULL DEFAULT 'ORDERED',
        current_location_id        UUID,
        current_responsible_type   inventory_responsible_type NOT NULL DEFAULT 'NONE',
        current_responsible_ref_id UUID,
        subscriber_ref_id          UUID,
        contract_ref_id            UUID,
        purchase_order_ref         VARCHAR(80),
        purchase_date              DATE,
        useful_life_months         INTEGER,
        warranty_until             DATE,
        created_at                 TIMESTAMPTZ               NOT NULL DEFAULT NOW(),
        updated_at                 TIMESTAMPTZ               NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_serialized_assets PRIMARY KEY (id),
        CONSTRAINT fk_serialized_assets_item
          FOREIGN KEY (inventory_item_id)
          REFERENCES inventory_items (id),
        CONSTRAINT fk_serialized_assets_location
          FOREIGN KEY (current_location_id)
          REFERENCES stock_locations (id)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_serialized_assets_tenant_normalized_serial
        ON serialized_assets (tenant_id, normalized_serial_number)
        WHERE normalized_serial_number IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_serialized_assets_tenant_normalized_mac
        ON serialized_assets (tenant_id, normalized_mac_address)
        WHERE normalized_mac_address IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX idx_serialized_assets_tenant_status
        ON serialized_assets (tenant_id, current_status)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_serialized_assets_tenant_location
        ON serialized_assets (tenant_id, current_location_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_serialized_assets_tenant_responsible
        ON serialized_assets (tenant_id, current_responsible_type, current_responsible_ref_id)
    `);
    await queryRunner.query(`
      CREATE TABLE stock_movements (
        id                       UUID                   NOT NULL DEFAULT gen_random_uuid(),
        tenant_id                UUID                   NOT NULL,
        movement_number          VARCHAR(40)            NOT NULL,
        origin                   stock_movement_origin  NOT NULL,
        origin_context           VARCHAR(64)            NOT NULL,
        origin_ref_id            VARCHAR(160),
        idempotency_key          VARCHAR(160)           NOT NULL,
        notes                    TEXT,
        actor_user_id            UUID,
        reversed_by_movement_id  UUID,
        is_reversal              BOOLEAN                NOT NULL DEFAULT FALSE,
        created_at               TIMESTAMPTZ            NOT NULL DEFAULT NOW(),
        updated_at               TIMESTAMPTZ            NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_stock_movements PRIMARY KEY (id),
        CONSTRAINT fk_stock_movements_reversed_by
          FOREIGN KEY (reversed_by_movement_id)
          REFERENCES stock_movements (id)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_stock_movements_tenant_idempotency_key
        ON stock_movements (tenant_id, idempotency_key)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_stock_movements_tenant_created_at
        ON stock_movements (tenant_id, created_at)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_stock_movements_tenant_origin
        ON stock_movements (tenant_id, origin_context, origin_ref_id)
    `);
    await queryRunner.query(`
      CREATE TABLE stock_balances (
        id                 UUID                    NOT NULL DEFAULT gen_random_uuid(),
        tenant_id          UUID                    NOT NULL,
        item_id            UUID                    NOT NULL,
        location_id        UUID                    NOT NULL,
        lot_id             UUID,
        condition          stock_balance_condition NOT NULL DEFAULT 'NEW',
        quantity_on_hand   NUMERIC(12,2)           NOT NULL DEFAULT 0,
        quantity_reserved  NUMERIC(12,2)           NOT NULL DEFAULT 0,
        created_at         TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
        updated_at         TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_stock_balances PRIMARY KEY (id),
        CONSTRAINT fk_stock_balances_item
          FOREIGN KEY (item_id)
          REFERENCES inventory_items (id),
        CONSTRAINT fk_stock_balances_location
          FOREIGN KEY (location_id)
          REFERENCES stock_locations (id),
        CONSTRAINT fk_stock_balances_lot
          FOREIGN KEY (lot_id)
          REFERENCES stock_lots (id)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_stock_balances_tenant_item_location_lot_condition
        ON stock_balances (tenant_id, item_id, location_id, lot_id, condition)
        WHERE lot_id IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_stock_balances_tenant_item_location_condition_no_lot
        ON stock_balances (tenant_id, item_id, location_id, condition)
        WHERE lot_id IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX idx_stock_balances_tenant_location_item
        ON stock_balances (tenant_id, location_id, item_id)
    `);
    await queryRunner.query(`
      CREATE TABLE stock_movement_lines (
        id                   UUID           NOT NULL DEFAULT gen_random_uuid(),
        tenant_id            UUID           NOT NULL,
        movement_id          UUID           NOT NULL,
        item_id              UUID           NOT NULL,
        location_id          UUID           NOT NULL,
        lot_id               UUID,
        serialized_asset_id  UUID,
        quantity             NUMERIC(12,2)  NOT NULL,
        unit_cost            NUMERIC(14,2),
        created_at           TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
        updated_at           TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_stock_movement_lines PRIMARY KEY (id),
        CONSTRAINT fk_stock_movement_lines_movement
          FOREIGN KEY (movement_id)
          REFERENCES stock_movements (id),
        CONSTRAINT fk_stock_movement_lines_item
          FOREIGN KEY (item_id)
          REFERENCES inventory_items (id),
        CONSTRAINT fk_stock_movement_lines_location
          FOREIGN KEY (location_id)
          REFERENCES stock_locations (id),
        CONSTRAINT fk_stock_movement_lines_lot
          FOREIGN KEY (lot_id)
          REFERENCES stock_lots (id),
        CONSTRAINT fk_stock_movement_lines_asset
          FOREIGN KEY (serialized_asset_id)
          REFERENCES serialized_assets (id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_stock_movement_lines_movement
        ON stock_movement_lines (movement_id, created_at)
    `);
    await queryRunner.query(`
      CREATE TABLE goods_receipt_lines (
        id                      UUID           NOT NULL DEFAULT gen_random_uuid(),
        tenant_id               UUID           NOT NULL,
        goods_receipt_id        UUID           NOT NULL,
        purchase_order_line_id  UUID           NOT NULL,
        item_id                 UUID           NOT NULL,
        quantity_received       NUMERIC(12,2)  NOT NULL,
        lot_id                  UUID,
        created_at              TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
        updated_at              TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_goods_receipt_lines PRIMARY KEY (id),
        CONSTRAINT fk_goods_receipt_lines_receipt
          FOREIGN KEY (goods_receipt_id)
          REFERENCES goods_receipts (id),
        CONSTRAINT fk_goods_receipt_lines_order_line
          FOREIGN KEY (purchase_order_line_id)
          REFERENCES purchase_order_lines (id),
        CONSTRAINT fk_goods_receipt_lines_item
          FOREIGN KEY (item_id)
          REFERENCES inventory_items (id),
        CONSTRAINT fk_goods_receipt_lines_lot
          FOREIGN KEY (lot_id)
          REFERENCES stock_lots (id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_goods_receipt_lines_receipt
        ON goods_receipt_lines (goods_receipt_id, created_at)
    `);
    await queryRunner.query(`
      CREATE TABLE asset_lifecycle_events (
        id                   UUID                       NOT NULL DEFAULT gen_random_uuid(),
        tenant_id            UUID                       NOT NULL,
        serialized_asset_id  UUID                       NOT NULL,
        event_type           asset_lifecycle_event_type NOT NULL,
        from_status          serialized_asset_status,
        to_status            serialized_asset_status,
        location_id          UUID,
        responsible_ref_id   UUID,
        notes                TEXT,
        actor_user_id        UUID,
        created_at           TIMESTAMPTZ                NOT NULL DEFAULT NOW(),
        updated_at           TIMESTAMPTZ                NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_asset_lifecycle_events PRIMARY KEY (id),
        CONSTRAINT fk_asset_lifecycle_events_asset
          FOREIGN KEY (serialized_asset_id)
          REFERENCES serialized_assets (id),
        CONSTRAINT fk_asset_lifecycle_events_location
          FOREIGN KEY (location_id)
          REFERENCES stock_locations (id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_asset_lifecycle_events_asset
        ON asset_lifecycle_events (serialized_asset_id, created_at)
    `);
    await queryRunner.query(`
      CREATE TABLE asset_loan_assignments (
        id                     UUID         NOT NULL DEFAULT gen_random_uuid(),
        tenant_id              UUID         NOT NULL,
        serialized_asset_id    UUID         NOT NULL,
        subscriber_ref_id      UUID         NOT NULL,
        contract_ref_id        UUID,
        installed_at           TIMESTAMPTZ  NOT NULL,
        removed_at             TIMESTAMPTZ,
        execution_order_ref_id UUID,
        stock_movement_id      UUID,
        created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_asset_loan_assignments PRIMARY KEY (id),
        CONSTRAINT fk_asset_loan_assignments_asset
          FOREIGN KEY (serialized_asset_id)
          REFERENCES serialized_assets (id),
        CONSTRAINT fk_asset_loan_assignments_movement
          FOREIGN KEY (stock_movement_id)
          REFERENCES stock_movements (id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_asset_loan_assignments_asset
        ON asset_loan_assignments (serialized_asset_id, installed_at)
    `);
    await queryRunner.query(`
      CREATE TABLE inventory_write_offs (
        id                    UUID              NOT NULL DEFAULT gen_random_uuid(),
        tenant_id             UUID              NOT NULL,
        serialized_asset_id   UUID,
        item_id               UUID,
        reason                write_off_reason  NOT NULL,
        status                VARCHAR(32)       NOT NULL DEFAULT 'REQUESTED',
        requested_by_user_id  UUID              NOT NULL,
        approved_by_user_id   UUID,
        approved_at           TIMESTAMPTZ,
        stock_movement_id     UUID,
        notes                 TEXT,
        created_at            TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_inventory_write_offs PRIMARY KEY (id),
        CONSTRAINT chk_inventory_write_offs_target
          CHECK (serialized_asset_id IS NOT NULL OR item_id IS NOT NULL),
        CONSTRAINT fk_inventory_write_offs_asset
          FOREIGN KEY (serialized_asset_id)
          REFERENCES serialized_assets (id),
        CONSTRAINT fk_inventory_write_offs_item
          FOREIGN KEY (item_id)
          REFERENCES inventory_items (id),
        CONSTRAINT fk_inventory_write_offs_movement
          FOREIGN KEY (stock_movement_id)
          REFERENCES stock_movements (id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_inventory_write_offs_tenant_status
        ON inventory_write_offs (tenant_id, status)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_inventory_write_offs_tenant_approved_at
        ON inventory_write_offs (tenant_id, approved_at)
    `);
  }
  async down(queryRunner) {
    await queryRunner.query(`DROP TABLE IF EXISTS inventory_write_offs`);
    await queryRunner.query(`DROP TABLE IF EXISTS asset_loan_assignments`);
    await queryRunner.query(`DROP TABLE IF EXISTS asset_lifecycle_events`);
    await queryRunner.query(`DROP TABLE IF EXISTS goods_receipt_lines`);
    await queryRunner.query(`DROP TABLE IF EXISTS stock_movement_lines`);
    await queryRunner.query(`DROP TABLE IF EXISTS stock_balances`);
    await queryRunner.query(`DROP TABLE IF EXISTS stock_movements`);
    await queryRunner.query(`DROP TABLE IF EXISTS serialized_assets`);
    await queryRunner.query(`DROP TABLE IF EXISTS stock_lots`);
    await queryRunner.query(`DROP TABLE IF EXISTS goods_receipts`);
    await queryRunner.query(`DROP TABLE IF EXISTS purchase_order_lines`);
    await queryRunner.query(`DROP TABLE IF EXISTS purchase_orders`);
    await queryRunner.query(`DROP TABLE IF EXISTS supplier_quotes`);
    await queryRunner.query(`DROP TABLE IF EXISTS purchase_requests`);
    await queryRunner.query(`DROP TABLE IF EXISTS stock_locations`);
    await queryRunner.query(`DROP TABLE IF EXISTS inventory_items`);
    await queryRunner.query(`DROP TYPE IF EXISTS write_off_reason`);
    await queryRunner.query(`DROP TYPE IF EXISTS asset_lifecycle_event_type`);
    await queryRunner.query(`DROP TYPE IF EXISTS goods_receipt_status`);
    await queryRunner.query(`DROP TYPE IF EXISTS purchase_order_status`);
    await queryRunner.query(`DROP TYPE IF EXISTS purchase_request_status`);
    await queryRunner.query(`DROP TYPE IF EXISTS stock_movement_origin`);
    await queryRunner.query(`DROP TYPE IF EXISTS serialized_asset_status`);
    await queryRunner.query(`DROP TYPE IF EXISTS inventory_responsible_type`);
    await queryRunner.query(`DROP TYPE IF EXISTS stock_balance_condition`);
    await queryRunner.query(`DROP TYPE IF EXISTS stock_location_status`);
    await queryRunner.query(`DROP TYPE IF EXISTS stock_location_type`);
    await queryRunner.query(`DROP TYPE IF EXISTS inventory_item_status`);
    await queryRunner.query(`DROP TYPE IF EXISTS inventory_item_category`);
    await queryRunner.query(`DROP TYPE IF EXISTS inventory_tracking_mode`);
  }
}
exports.CreateInventoryScmModule0470000000000 = CreateInventoryScmModule0470000000000;
//# sourceMappingURL=047_create_inventory_scm_module.js.map
