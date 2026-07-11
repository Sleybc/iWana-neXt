import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migracion 061: trazabilidad de actores en transiciones RFQ (MOD12 Fase 04).
 */
export class AddPurchaseRfqActorRefs0610000000000 implements MigrationInterface {
  name = 'AddPurchaseRfqActorRefs0610000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE purchase_rfqs
        ADD COLUMN sent_by_user_id UUID,
        ADD COLUMN closed_by_user_id UUID
    `);

    await queryRunner.query(`
      ALTER TABLE purchase_rfq_invitations
        ADD COLUMN declined_by_user_id UUID
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE purchase_rfq_invitations
        DROP COLUMN IF EXISTS declined_by_user_id
    `);

    await queryRunner.query(`
      ALTER TABLE purchase_rfqs
        DROP COLUMN IF EXISTS closed_by_user_id,
        DROP COLUMN IF EXISTS sent_by_user_id
    `);
  }
}
