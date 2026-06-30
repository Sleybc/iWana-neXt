'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.ReplaceDisplayNameWithFirstLastName1742300000000 = void 0;
/**
 * Migración 004 — Reemplaza display_name por first_name + last_name en platform_users.
 *
 * Decisión de diseño: se prefieren campos semánticos separados a un nombre compuesto
 * para facilitar ordenamiento, búsqueda y presentación contextual en la UI.
 */
class ReplaceDisplayNameWithFirstLastName1742300000000 {
  name = 'ReplaceDisplayNameWithFirstLastName1742300000000';
  async up(queryRunner) {
    await queryRunner.query(`
      ALTER TABLE "public"."platform_users"
      DROP COLUMN IF EXISTS "display_name"
    `);
    await queryRunner.query(`
      ALTER TABLE "public"."platform_users"
      ADD COLUMN IF NOT EXISTS "first_name" VARCHAR(100)
    `);
    await queryRunner.query(`
      ALTER TABLE "public"."platform_users"
      ADD COLUMN IF NOT EXISTS "last_name" VARCHAR(100)
    `);
  }
  async down(queryRunner) {
    await queryRunner.query(`
      ALTER TABLE "public"."platform_users"
      DROP COLUMN IF EXISTS "last_name"
    `);
    await queryRunner.query(`
      ALTER TABLE "public"."platform_users"
      DROP COLUMN IF EXISTS "first_name"
    `);
    await queryRunner.query(`
      ALTER TABLE "public"."platform_users"
      ADD COLUMN IF NOT EXISTS "display_name" VARCHAR(150)
    `);
  }
}
exports.ReplaceDisplayNameWithFirstLastName1742300000000 =
  ReplaceDisplayNameWithFirstLastName1742300000000;
//# sourceMappingURL=004_replace_display_name_with_first_last_name.js.map
