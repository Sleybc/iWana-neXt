import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 005 — Añade columnas de branding a public.tenants.
 *
 * Agrega 4 URLs nullable (logo y sello en variantes claro/oscuro) y un booleano
 * show_tenant_name con default true. Todas las URLs son nullable para no romper
 * tenants existentes. Sin cambios destructivos.
 *
 * Diseño del branding: docs/plans/2026-03-17-branding-logo-sello-design.md
 */
export class AddTenantBrandingColumns1742350000000 implements MigrationInterface {
  name = 'AddTenantBrandingColumns1742350000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
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

  public async down(queryRunner: QueryRunner): Promise<void> {
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
