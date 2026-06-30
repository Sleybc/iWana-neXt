'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.SoftDeleteTenantsAndPhoneLength1742400000000 = void 0;
/**
 * Migración 006 — Soft-delete de tenants y alineación de teléfono.
 *
 * Evita borrado físico inmediato de empresas desde plataforma. El schema tenant
 * queda retenido para recuperación/auditoría y una purga operativa posterior.
 */
class SoftDeleteTenantsAndPhoneLength1742400000000 {
  name = 'SoftDeleteTenantsAndPhoneLength1742400000000';
  async up(queryRunner) {
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
  async down(queryRunner) {
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
exports.SoftDeleteTenantsAndPhoneLength1742400000000 = SoftDeleteTenantsAndPhoneLength1742400000000;
//# sourceMappingURL=006_soft_delete_tenants_and_phone_length.js.map
