import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migracion 060: vincula supplier_quotes con RFQ e invitaciones.
 */
export class LinkSupplierQuotesToRfq0600000000000 implements MigrationInterface {
  name = 'LinkSupplierQuotesToRfq0600000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE supplier_quotes
      ADD COLUMN rfq_id UUID
    `);

    await queryRunner.query(`
      ALTER TABLE supplier_quotes
      ADD COLUMN rfq_invitation_id UUID
    `);

    await queryRunner.query(`
      ALTER TABLE supplier_quotes
      ADD CONSTRAINT fk_supplier_quotes_rfq
        FOREIGN KEY (rfq_id)
        REFERENCES purchase_rfqs (id)
    `);

    await queryRunner.query(`
      ALTER TABLE supplier_quotes
      ADD CONSTRAINT fk_supplier_quotes_rfq_invitation
        FOREIGN KEY (rfq_invitation_id)
        REFERENCES purchase_rfq_invitations (id)
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_supplier_quotes_rfq_invitation
        ON supplier_quotes (rfq_invitation_id)
        WHERE rfq_invitation_id IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_supplier_quotes_rfq_invitation`);
    await queryRunner.query(`
      ALTER TABLE supplier_quotes
      DROP CONSTRAINT IF EXISTS fk_supplier_quotes_rfq_invitation
    `);
    await queryRunner.query(`
      ALTER TABLE supplier_quotes
      DROP CONSTRAINT IF EXISTS fk_supplier_quotes_rfq
    `);
    await queryRunner.query(`
      ALTER TABLE supplier_quotes
      DROP COLUMN IF EXISTS rfq_invitation_id
    `);
    await queryRunner.query(`
      ALTER TABLE supplier_quotes
      DROP COLUMN IF EXISTS rfq_id
    `);
  }
}
