import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migracion 007 — Ciclo de vida de eliminacion diferida y limites nullable.
 *
 * - `max_subscribers = NULL` representa sin limite.
 * - `max_subscribers = 0` queda reservado para bloquear nuevos suscriptores.
 * - `MARKED_FOR_DELETION` separa contrato inactivo de eliminacion diferida.
 */
export class TenantLifecyclePurgeAndNullableLimits1742400001000 implements MigrationInterface {
  name = 'TenantLifecyclePurgeAndNullableLimits1742400001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "public"."tenants"
      ALTER COLUMN "max_subscribers" DROP DEFAULT
    `);

    await queryRunner.query(`
      UPDATE "public"."tenants"
      SET "max_subscribers" = NULL
      WHERE "max_subscribers" = 0
    `);

    await queryRunner.query(`
      ALTER TABLE "public"."tenants"
      ALTER COLUMN "max_subscribers" DROP NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "public"."tenants"
      DROP CONSTRAINT IF EXISTS "chk_tenants_status"
    `);

    await queryRunner.query(`
      ALTER TABLE "public"."tenants"
      ADD CONSTRAINT "chk_tenants_status" CHECK (
        "status" IN (
          'PROVISIONING', 'ACTIVE', 'SUSPENDED', 'INACTIVE',
          'MARKED_FOR_DELETION', 'PROVISIONING_FAILED'
        )
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tenants_deletion_window"
      ON "public"."tenants" ("deleted_at")
      WHERE "status" = 'MARKED_FOR_DELETION' AND "deleted_at" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_tenants_deletion_window"`);

    await queryRunner.query(`
      UPDATE "public"."tenants"
      SET "status" = 'INACTIVE'
      WHERE "status" = 'MARKED_FOR_DELETION'
    `);

    await queryRunner.query(`
      ALTER TABLE "public"."tenants"
      DROP CONSTRAINT IF EXISTS "chk_tenants_status"
    `);

    await queryRunner.query(`
      ALTER TABLE "public"."tenants"
      ADD CONSTRAINT "chk_tenants_status" CHECK (
        "status" IN (
          'PROVISIONING', 'ACTIVE', 'SUSPENDED',
          'INACTIVE', 'PROVISIONING_FAILED'
        )
      )
    `);

    await queryRunner.query(`
      UPDATE "public"."tenants"
      SET "max_subscribers" = 0
      WHERE "max_subscribers" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "public"."tenants"
      ALTER COLUMN "max_subscribers" SET DEFAULT 0
    `);

    await queryRunner.query(`
      ALTER TABLE "public"."tenants"
      ALTER COLUMN "max_subscribers" SET NOT NULL
    `);
  }
}
