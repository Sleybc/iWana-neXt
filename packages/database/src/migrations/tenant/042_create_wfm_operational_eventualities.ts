import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWfmOperationalEventualities1748653200042 implements MigrationInterface {
  name = 'CreateWfmOperationalEventualities1748653200042';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "wfm_operational_eventualities" (
        "id"                    UUID          NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"             UUID          NOT NULL,
        "user_id"               UUID          NOT NULL,
        "organization_site_id"  UUID,
        "type"                  VARCHAR(40)   NOT NULL,
        "status"                VARCHAR(20)   NOT NULL DEFAULT 'pending',
        "starts_at"             TIMESTAMPTZ   NOT NULL,
        "ends_at"               TIMESTAMPTZ   NOT NULL,
        "reason"                VARCHAR(320),
        "origin"                VARCHAR(80),
        "requires_hr_review"    BOOLEAN       NOT NULL DEFAULT false,
        "created_by_id"         UUID          NOT NULL,
        "created_at"            TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "updated_at"            TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "deleted_at"            TIMESTAMPTZ,
        CONSTRAINT "PK_wfm_operational_eventualities" PRIMARY KEY ("id"),
        CONSTRAINT "chk_wfm_oe_starts_before_ends" CHECK ("starts_at" < "ends_at")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_wfm_oe_tenant_user"
        ON "wfm_operational_eventualities" ("tenant_id", "user_id")
        WHERE deleted_at IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_wfm_oe_tenant_site"
        ON "wfm_operational_eventualities" ("tenant_id", "organization_site_id")
        WHERE organization_site_id IS NOT NULL AND deleted_at IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_wfm_oe_tenant_time_range"
        ON "wfm_operational_eventualities" ("tenant_id", "starts_at", "ends_at")
        WHERE deleted_at IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "wfm_operational_eventualities"`);
  }
}
