'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.AddTenantBrandingColumns1742350000000 = void 0;
/**
 * Migración 005 — Añade columnas de branding a public.tenants.
 *
 * Agrega 4 URLs nullable (logo y sello en variantes claro/oscuro) y un booleano
 * show_tenant_name con default true. Todas las URLs son nullable para no romper
 * tenants existentes. Sin cambios destructivos.
 *
 * Diseño del branding: docs/plans/2026-03-17-branding-logo-sello-design.md
 */
class AddTenantBrandingColumns1742350000000 {
  name = 'AddTenantBrandingColumns1742350000000';
  async up(queryRunner) {
    await queryRunner.query(`
      ALTER TABLE "public"."tenants"
      ADD COLUMN IF NOT EXISTS "logo_light_url" VARCHAR(500) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "public"."tenants"
      ADD COLUMN IF NOT EXISTS "logo_dark_url" VARCHAR(500) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "public"."tenants"
      ADD COLUMN IF NOT EXISTS "seal_light_url" VARCHAR(500) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "public"."tenants"
      ADD COLUMN IF NOT EXISTS "seal_dark_url" VARCHAR(500) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "public"."tenants"
      ADD COLUMN IF NOT EXISTS "show_tenant_name" BOOLEAN NOT NULL DEFAULT TRUE
    `);
  }
  async down(queryRunner) {
    await queryRunner.query(`
      ALTER TABLE "public"."tenants"
      DROP COLUMN IF EXISTS "show_tenant_name"
    `);
    await queryRunner.query(`
      ALTER TABLE "public"."tenants"
      DROP COLUMN IF EXISTS "seal_dark_url"
    `);
    await queryRunner.query(`
      ALTER TABLE "public"."tenants"
      DROP COLUMN IF EXISTS "seal_light_url"
    `);
    await queryRunner.query(`
      ALTER TABLE "public"."tenants"
      DROP COLUMN IF EXISTS "logo_dark_url"
    `);
    await queryRunner.query(`
      ALTER TABLE "public"."tenants"
      DROP COLUMN IF EXISTS "logo_light_url"
    `);
  }
}
exports.AddTenantBrandingColumns1742350000000 = AddTenantBrandingColumns1742350000000;
//# sourceMappingURL=005_add_tenant_branding_columns.js.map
