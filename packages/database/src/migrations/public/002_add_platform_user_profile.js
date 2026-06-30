'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.AddPlatformUserProfile1742100000000 = void 0;
/**
 * Migracion 002 — Extension de perfil para usuarios de plataforma.
 *
 * Agrega campos operativos de perfil en public.platform_users para habilitar
 * edicion de perfil y preferencias desde la UI administrativa.
 */
class AddPlatformUserProfile1742100000000 {
  name = 'AddPlatformUserProfile1742100000000';
  async up(queryRunner) {
    await queryRunner.query(`
      ALTER TABLE "public"."platform_users"
      ADD COLUMN IF NOT EXISTS "display_name" VARCHAR(150)
    `);
    await queryRunner.query(`
      ALTER TABLE "public"."platform_users"
      ADD COLUMN IF NOT EXISTS "phone" VARCHAR(20)
    `);
    await queryRunner.query(`
      ALTER TABLE "public"."platform_users"
      ADD COLUMN IF NOT EXISTS "timezone" VARCHAR(50) NOT NULL DEFAULT 'America/Bogota'
    `);
    await queryRunner.query(`
      ALTER TABLE "public"."platform_users"
      ADD COLUMN IF NOT EXISTS "language" VARCHAR(10) NOT NULL DEFAULT 'es-CO'
    `);
  }
  async down(queryRunner) {
    await queryRunner.query(`
      ALTER TABLE "public"."platform_users"
      DROP COLUMN IF EXISTS "language"
    `);
    await queryRunner.query(`
      ALTER TABLE "public"."platform_users"
      DROP COLUMN IF EXISTS "timezone"
    `);
    await queryRunner.query(`
      ALTER TABLE "public"."platform_users"
      DROP COLUMN IF EXISTS "phone"
    `);
    await queryRunner.query(`
      ALTER TABLE "public"."platform_users"
      DROP COLUMN IF EXISTS "display_name"
    `);
  }
}
exports.AddPlatformUserProfile1742100000000 = AddPlatformUserProfile1742100000000;
//# sourceMappingURL=002_add_platform_user_profile.js.map
