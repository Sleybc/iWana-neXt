import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPurchaseOrderResolution0680000000000 implements MigrationInterface {
  name = 'AddPurchaseOrderResolution0680000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE purchase_orders
        ADD COLUMN cancellation_reason TEXT,
        ADD COLUMN cancelled_by_user_id UUID,
        ADD COLUMN closed_by_user_id UUID
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE purchase_orders
        DROP COLUMN IF EXISTS closed_by_user_id,
        DROP COLUMN IF EXISTS cancelled_by_user_id,
        DROP COLUMN IF EXISTS cancellation_reason
    `);
  }
}
