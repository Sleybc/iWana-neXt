'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.AddTenantBrandingMetadata1746164800000 = void 0;
/**
 * Migración 011 — Metadata pública de branding por tenant.
 *
 * Extiende `public.tenants` con campos textuales de identidad visual
 * para el portal empresarial (producto, superficie, título y descripción).
 *
 * Las columnas son nullable para permitir defaults efectivos en el servicio,
 * sin necesidad de backfill destructivo.
 */
class AddTenantBrandingMetadata1746164800000 {
  name = 'AddTenantBrandingMetadata1746164800000';
  async up(queryRunner) {
    await queryRunner.query(`
      ALTER TABLE "public"."tenants"
        ADD COLUMN IF NOT EXISTS "branding_product_name" varchar(120),
        ADD COLUMN IF NOT EXISTS "branding_surface_name" varchar(120),
        ADD COLUMN IF NOT EXISTS "branding_metadata_title" varchar(180),
        ADD COLUMN IF NOT EXISTS "branding_metadata_description" varchar(300)
    `);
  }
  async down(queryRunner) {
    await queryRunner.query(`
      ALTER TABLE "public"."tenants"
        DROP COLUMN IF EXISTS "branding_metadata_description",
        DROP COLUMN IF EXISTS "branding_metadata_title",
        DROP COLUMN IF EXISTS "branding_surface_name",
        DROP COLUMN IF EXISTS "branding_product_name"
    `);
  }
}
exports.AddTenantBrandingMetadata1746164800000 = AddTenantBrandingMetadata1746164800000;
//# sourceMappingURL=011_add_tenant_branding_metadata.js.map
