import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 011 — Metadata pública de branding por tenant.
 *
 * Extiende `public.tenants` con campos textuales de identidad visual
 * para el portal empresarial (producto, superficie, título y descripción).
 *
 * Las columnas son nullable para permitir defaults efectivos en el servicio,
 * sin necesidad de backfill destructivo.
 */
export class AddTenantBrandingMetadata1746164800000 implements MigrationInterface {
  name = 'AddTenantBrandingMetadata1746164800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "public"."tenants"
        ADD COLUMN IF NOT EXISTS "branding_product_name" varchar(120),
        ADD COLUMN IF NOT EXISTS "branding_surface_name" varchar(120),
        ADD COLUMN IF NOT EXISTS "branding_metadata_title" varchar(180),
        ADD COLUMN IF NOT EXISTS "branding_metadata_description" varchar(300)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "public"."tenants"
        DROP COLUMN IF EXISTS "branding_metadata_description",
        DROP COLUMN IF EXISTS "branding_metadata_title",
        DROP COLUMN IF EXISTS "branding_surface_name",
        DROP COLUMN IF EXISTS "branding_product_name"
    `);
  }
}
