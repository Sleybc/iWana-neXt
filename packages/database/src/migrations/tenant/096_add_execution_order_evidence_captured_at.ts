import { MigrationInterface, QueryRunner } from 'typeorm';

const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

export class AddExecutionOrderEvidenceCapturedAt0960000000000 implements MigrationInterface {
  name = 'AddExecutionOrderEvidenceCapturedAt0960000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE execution_order_evidence
       ADD COLUMN IF NOT EXISTS captured_at TIMESTAMPTZ`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (process.env[DESTRUCTIVE_DOWN_ENV_VAR] !== 'true') {
      const rows = ((await queryRunner.query(
        `SELECT COUNT(*)::int AS total FROM execution_order_evidence WHERE captured_at IS NOT NULL`,
      )) ?? []) as Array<{ total: number }>;
      const total = rows[0]?.total ?? 0;
      if (total > 0) {
        throw new Error(
          `Rollback de AddExecutionOrderEvidenceCapturedAt bloqueado: ` +
            `captured_at contiene ${total} valor(es). Para continuar de forma destructiva, ` +
            `exporte ${DESTRUCTIVE_DOWN_ENV_VAR}=true de forma explícita.`,
        );
      }
    }

    await queryRunner.query(
      `ALTER TABLE execution_order_evidence
       DROP COLUMN IF EXISTS captured_at`,
    );
  }
}
