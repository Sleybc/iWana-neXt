import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExecutionOrderEvidenceCapturedAt0960000000000 implements MigrationInterface {
  name = 'AddExecutionOrderEvidenceCapturedAt0960000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE execution_order_evidence
       ADD COLUMN IF NOT EXISTS captured_at TIMESTAMPTZ`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE execution_order_evidence
       DROP COLUMN IF EXISTS captured_at`,
    );
  }
}
