import { MigrationInterface, QueryRunner } from 'typeorm';

export class HardenVisitRequestsIndexes1700000000035 implements MigrationInterface {
  name = 'HardenVisitRequestsIndexes1700000000035';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_visit_requests_tenant_origin_status_created"
      ON "visit_requests" ("tenant_id", "origin_context", "status", "created_at" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_visit_requests_tenant_territory_status"
      ON "visit_requests" ("tenant_id", "municipality", "sector", "status")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_visit_requests_tenant_sla_status"
      ON "visit_requests" ("tenant_id", "sla_due_at", "status")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_visit_requests_active_origin_unique"
      ON "visit_requests" ("tenant_id", "origin_context", "origin_ref", "work_type")
      WHERE "origin_ref" IS NOT NULL
        AND "deleted_at" IS NULL
        AND "status" NOT IN ('SCHEDULED', 'CANCELLED', 'REJECTED', 'EXPIRED')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "idx_visit_requests_active_origin_unique"');
    await queryRunner.query('DROP INDEX IF EXISTS "idx_visit_requests_tenant_sla_status"');
    await queryRunner.query('DROP INDEX IF EXISTS "idx_visit_requests_tenant_territory_status"');
    await queryRunner.query(
      'DROP INDEX IF EXISTS "idx_visit_requests_tenant_origin_status_created"',
    );
  }
}
