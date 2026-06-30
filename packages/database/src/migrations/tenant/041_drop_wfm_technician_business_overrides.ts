import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ADR-041 — Retiro de Excepciones por tecnico de WFM.
 * up:   elimina la tabla wfm_technician_business_overrides y sus indices.
 * down: recrea la estructura original para rollback controlado.
 */
export class DropWfmTechnicianBusinessOverrides1748566800000 implements MigrationInterface {
  name = 'DropWfmTechnicianBusinessOverrides1748566800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_wfm_technician_overrides_tenant_user_date"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_wfm_technician_overrides_tenant_user_weekday"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_wfm_technician_overrides_tenant_org_site"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "wfm_technician_business_overrides"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "wfm_technician_business_overrides" (
        "id"                   uuid          NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id"            uuid          NOT NULL,
        "user_id"              uuid          NOT NULL,
        "organization_site_id" uuid,
        "override_date"        date,
        "weekday"              business_hours_weekday_enum,
        "start_time"           time,
        "end_time"             time,
        "is_enabled"           boolean       NOT NULL DEFAULT true,
        "reason"               varchar(160),
        "created_at"           timestamptz   NOT NULL DEFAULT now(),
        "updated_at"           timestamptz   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_wfm_technician_business_overrides" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_wfm_technician_overrides_tenant_user_date"
        ON "wfm_technician_business_overrides" ("tenant_id", "user_id", "override_date")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_wfm_technician_overrides_tenant_user_weekday"
        ON "wfm_technician_business_overrides" ("tenant_id", "user_id", "weekday")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_wfm_technician_overrides_tenant_org_site"
        ON "wfm_technician_business_overrides" ("tenant_id", "organization_site_id")
    `);
  }
}
