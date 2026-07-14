import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migracion 067: trazabilidad de resolucion (rechazo/cancelacion) de solicitudes de compra (MOD12 Fase 06).
 */
export class AddPurchaseRequestResolution0670000000000 implements MigrationInterface {
  name = 'AddPurchaseRequestResolution0670000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE purchase_requests
        ADD COLUMN resolution_reason TEXT,
        ADD COLUMN resolved_by_user_id UUID
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE purchase_requests
        DROP COLUMN IF EXISTS resolved_by_user_id,
        DROP COLUMN IF EXISTS resolution_reason
    `);
  }
}
