import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migracion 059: tablas RFQ e invitaciones para MOD12 Compras Fase 04.
 */
export class CreatePurchaseRfq0590000000000 implements MigrationInterface {
  name = 'CreatePurchaseRfq0590000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE purchase_rfq_status AS ENUM (
        'DRAFT',
        'SENT',
        'RECEIVING',
        'CLOSED',
        'CANCELLED'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE purchase_rfq_invitation_status AS ENUM (
        'INVITED',
        'RESPONDED',
        'DECLINED',
        'EXPIRED',
        'CANCELLED'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE purchase_rfqs (
        id                   UUID                    NOT NULL DEFAULT gen_random_uuid(),
        tenant_id            UUID                    NOT NULL,
        purchase_request_id  UUID                    NOT NULL,
        rfq_number           VARCHAR(40)             NOT NULL,
        status               purchase_rfq_status     NOT NULL DEFAULT 'DRAFT',
        currency             VARCHAR(3)              NOT NULL DEFAULT 'COP',
        response_deadline    DATE,
        sent_at              TIMESTAMPTZ,
        closed_at            TIMESTAMPTZ,
        created_by_user_id   UUID,
        notes                TEXT,
        created_at           TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
        updated_at           TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_purchase_rfqs PRIMARY KEY (id),
        CONSTRAINT fk_purchase_rfqs_request
          FOREIGN KEY (purchase_request_id)
          REFERENCES purchase_requests (id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_purchase_rfqs_tenant_request
        ON purchase_rfqs (tenant_id, purchase_request_id)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_purchase_rfqs_tenant_status
        ON purchase_rfqs (tenant_id, status)
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_purchase_rfqs_active_request
        ON purchase_rfqs (purchase_request_id)
        WHERE status IN ('DRAFT', 'SENT', 'RECEIVING')
    `);

    await queryRunner.query(`
      CREATE TABLE purchase_rfq_invitations (
        id              UUID                              NOT NULL DEFAULT gen_random_uuid(),
        tenant_id       UUID                              NOT NULL,
        rfq_id          UUID                              NOT NULL,
        party_ref_id    UUID                              NOT NULL,
        status          purchase_rfq_invitation_status    NOT NULL DEFAULT 'INVITED',
        invited_at      TIMESTAMPTZ,
        responded_at    TIMESTAMPTZ,
        declined_at     TIMESTAMPTZ,
        decline_reason  TEXT,
        created_at      TIMESTAMPTZ                       NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ                       NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_purchase_rfq_invitations PRIMARY KEY (id),
        CONSTRAINT fk_purchase_rfq_invitations_rfq
          FOREIGN KEY (rfq_id)
          REFERENCES purchase_rfqs (id)
          ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_purchase_rfq_invitations_tenant_rfq
        ON purchase_rfq_invitations (tenant_id, rfq_id)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_purchase_rfq_invitations_tenant_party
        ON purchase_rfq_invitations (tenant_id, party_ref_id)
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_purchase_rfq_invitations_rfq_party
        ON purchase_rfq_invitations (rfq_id, party_ref_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS purchase_rfq_invitations`);
    await queryRunner.query(`DROP TABLE IF EXISTS purchase_rfqs`);
    await queryRunner.query(`DROP TYPE IF EXISTS purchase_rfq_invitation_status`);
    await queryRunner.query(`DROP TYPE IF EXISTS purchase_rfq_status`);
  }
}
