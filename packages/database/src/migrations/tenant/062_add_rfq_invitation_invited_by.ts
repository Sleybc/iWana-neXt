import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migracion 062: actor que invita proveedores a una RFQ (MOD12 Fase 04 remedacion).
 */
export class AddRfqInvitationInvitedBy0620000000000 implements MigrationInterface {
  name = 'AddRfqInvitationInvitedBy0620000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE purchase_rfq_invitations
        ADD COLUMN invited_by_user_id UUID
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE purchase_rfq_invitations
        DROP COLUMN IF EXISTS invited_by_user_id
    `);
  }
}
