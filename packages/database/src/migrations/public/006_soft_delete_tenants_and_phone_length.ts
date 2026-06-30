import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 006 — Soft-delete de tenants y alineación de teléfono.
 *
 * Evita borrado físico inmediato de empresas desde plataforma. El schema tenant
 * queda retenido para recuperación/auditoría y una purga operativa posterior.
 */
export class SoftDeleteTenantsAndPhoneLength1742400000000 implements MigrationInterface {
  name = 'SoftDeleteTenantsAndPhoneLength1742400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "public"."tenants"
      ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ
    `);

    await queryRunner.query(`
      ALTER TABLE "public"."tenants"
      ALTER COLUMN "phone" TYPE VARCHAR(50)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tenants_deleted_at"
      ON "public"."tenants" ("deleted_at")
      WHERE "deleted_at" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_tenants_deleted_at"`);

    await queryRunner.query(`
      ALTER TABLE "public"."tenants"
      ALTER COLUMN "phone" TYPE VARCHAR(20)
    `);

    await queryRunner.query(`
      ALTER TABLE "public"."tenants"
      DROP COLUMN IF EXISTS "deleted_at"
    `);
  }
}
