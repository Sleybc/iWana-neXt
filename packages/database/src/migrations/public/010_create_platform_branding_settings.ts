import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 010 — Branding propio de la consola de plataforma.
 *
 * Crea un registro singleton en public.platform_branding_settings para que
 * apps/web tenga identidad visual persistente e independiente de tenants.
 */
export class CreatePlatformBrandingSettings1746164700000 implements MigrationInterface {
  name = 'CreatePlatformBrandingSettings1746164700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "public"."platform_branding_settings" (
        "id" varchar(30) NOT NULL DEFAULT 'platform',
        "product_name" varchar(120) NOT NULL,
        "surface_name" varchar(120) NOT NULL,
        "metadata_title" varchar(180) NOT NULL,
        "metadata_description" varchar(300) NOT NULL,
        "logo_url" varchar(500),
        "logo_asset_id" uuid,
        "favicon_url" varchar(500),
        "favicon_asset_id" uuid,
        "login_background_light_url" varchar(500),
        "login_background_light_asset_id" uuid,
        "login_background_dark_url" varchar(500),
        "login_background_dark_asset_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_platform_branding_settings" PRIMARY KEY ("id"),
        CONSTRAINT "chk_platform_branding_singleton" CHECK ("id" = 'platform')
      )
    `);

    const foreignKeys = [
      ['fk_platform_branding_logo_asset_id', 'logo_asset_id'],
      ['fk_platform_branding_favicon_asset_id', 'favicon_asset_id'],
      ['fk_platform_branding_login_bg_light_asset_id', 'login_background_light_asset_id'],
      ['fk_platform_branding_login_bg_dark_asset_id', 'login_background_dark_asset_id'],
    ] as const;

    for (const [constraintName, columnName] of foreignKeys) {
      await queryRunner.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = '${constraintName}'
          ) THEN
            ALTER TABLE "public"."platform_branding_settings"
              ADD CONSTRAINT "${constraintName}"
              FOREIGN KEY ("${columnName}")
              REFERENCES "public"."media_assets"("id")
              ON DELETE SET NULL;
          END IF;
        END $$
      `);
    }

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.update_platform_branding_settings_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "trg_platform_branding_settings_updated_at"
      ON "public"."platform_branding_settings"
    `);

    await queryRunner.query(`
      CREATE TRIGGER "trg_platform_branding_settings_updated_at"
      BEFORE UPDATE ON "public"."platform_branding_settings"
      FOR EACH ROW EXECUTE FUNCTION public.update_platform_branding_settings_updated_at()
    `);

    await queryRunner.query(`
      INSERT INTO "public"."platform_branding_settings" (
        "id",
        "product_name",
        "surface_name",
        "metadata_title",
        "metadata_description",
        "logo_url",
        "favicon_url"
      ) VALUES (
        'platform',
        'iWana neXt',
        'Portal administrativo',
        'iWana neXt — Portal Administrativo',
        'Portal administrativo para operadores ISP iWana neXt',
        '/brand/iwiso6.png',
        '/brand/favicon-gecko.svg'
      )
      ON CONFLICT ("id") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "trg_platform_branding_settings_updated_at" ON "public"."platform_branding_settings"`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS public.update_platform_branding_settings_updated_at()`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "public"."platform_branding_settings"`);
  }
}
