import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 009 — Extiende branding del tenant con slots híbridos URL/asset.
 *
 * Agrega favicon y fondos de login, además de referencias opcionales a
 * `public.media_assets` para soportar uploads propios sin perder compatibilidad
 * con URLs HTTPS externas.
 */
export class ExtendTenantBrandingV21746164500000 implements MigrationInterface {
  name = 'ExtendTenantBrandingV21746164500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "public"."tenants"
        ADD COLUMN IF NOT EXISTS "favicon_light_url" varchar(500),
        ADD COLUMN IF NOT EXISTS "favicon_dark_url" varchar(500),
        ADD COLUMN IF NOT EXISTS "login_background_light_url" varchar(500),
        ADD COLUMN IF NOT EXISTS "login_background_dark_url" varchar(500),
        ADD COLUMN IF NOT EXISTS "logo_light_asset_id" uuid,
        ADD COLUMN IF NOT EXISTS "logo_dark_asset_id" uuid,
        ADD COLUMN IF NOT EXISTS "seal_light_asset_id" uuid,
        ADD COLUMN IF NOT EXISTS "seal_dark_asset_id" uuid,
        ADD COLUMN IF NOT EXISTS "favicon_light_asset_id" uuid,
        ADD COLUMN IF NOT EXISTS "favicon_dark_asset_id" uuid,
        ADD COLUMN IF NOT EXISTS "login_background_light_asset_id" uuid,
        ADD COLUMN IF NOT EXISTS "login_background_dark_asset_id" uuid
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'fk_tenants_logo_light_asset_id'
        ) THEN
          ALTER TABLE "public"."tenants"
            ADD CONSTRAINT "fk_tenants_logo_light_asset_id"
            FOREIGN KEY ("logo_light_asset_id")
            REFERENCES "public"."media_assets"("id")
            ON DELETE SET NULL;
        END IF;
      END $$
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'fk_tenants_logo_dark_asset_id'
        ) THEN
          ALTER TABLE "public"."tenants"
            ADD CONSTRAINT "fk_tenants_logo_dark_asset_id"
            FOREIGN KEY ("logo_dark_asset_id")
            REFERENCES "public"."media_assets"("id")
            ON DELETE SET NULL;
        END IF;
      END $$
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'fk_tenants_seal_light_asset_id'
        ) THEN
          ALTER TABLE "public"."tenants"
            ADD CONSTRAINT "fk_tenants_seal_light_asset_id"
            FOREIGN KEY ("seal_light_asset_id")
            REFERENCES "public"."media_assets"("id")
            ON DELETE SET NULL;
        END IF;
      END $$
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'fk_tenants_seal_dark_asset_id'
        ) THEN
          ALTER TABLE "public"."tenants"
            ADD CONSTRAINT "fk_tenants_seal_dark_asset_id"
            FOREIGN KEY ("seal_dark_asset_id")
            REFERENCES "public"."media_assets"("id")
            ON DELETE SET NULL;
        END IF;
      END $$
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'fk_tenants_favicon_light_asset_id'
        ) THEN
          ALTER TABLE "public"."tenants"
            ADD CONSTRAINT "fk_tenants_favicon_light_asset_id"
            FOREIGN KEY ("favicon_light_asset_id")
            REFERENCES "public"."media_assets"("id")
            ON DELETE SET NULL;
        END IF;
      END $$
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'fk_tenants_favicon_dark_asset_id'
        ) THEN
          ALTER TABLE "public"."tenants"
            ADD CONSTRAINT "fk_tenants_favicon_dark_asset_id"
            FOREIGN KEY ("favicon_dark_asset_id")
            REFERENCES "public"."media_assets"("id")
            ON DELETE SET NULL;
        END IF;
      END $$
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'fk_tenants_login_background_light_asset_id'
        ) THEN
          ALTER TABLE "public"."tenants"
            ADD CONSTRAINT "fk_tenants_login_background_light_asset_id"
            FOREIGN KEY ("login_background_light_asset_id")
            REFERENCES "public"."media_assets"("id")
            ON DELETE SET NULL;
        END IF;
      END $$
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'fk_tenants_login_background_dark_asset_id'
        ) THEN
          ALTER TABLE "public"."tenants"
            ADD CONSTRAINT "fk_tenants_login_background_dark_asset_id"
            FOREIGN KEY ("login_background_dark_asset_id")
            REFERENCES "public"."media_assets"("id")
            ON DELETE SET NULL;
        END IF;
      END $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "public"."tenants" DROP CONSTRAINT IF EXISTS "fk_tenants_login_background_dark_asset_id"',
    );
    await queryRunner.query(
      'ALTER TABLE "public"."tenants" DROP CONSTRAINT IF EXISTS "fk_tenants_login_background_light_asset_id"',
    );
    await queryRunner.query(
      'ALTER TABLE "public"."tenants" DROP CONSTRAINT IF EXISTS "fk_tenants_favicon_dark_asset_id"',
    );
    await queryRunner.query(
      'ALTER TABLE "public"."tenants" DROP CONSTRAINT IF EXISTS "fk_tenants_favicon_light_asset_id"',
    );
    await queryRunner.query(
      'ALTER TABLE "public"."tenants" DROP CONSTRAINT IF EXISTS "fk_tenants_seal_dark_asset_id"',
    );
    await queryRunner.query(
      'ALTER TABLE "public"."tenants" DROP CONSTRAINT IF EXISTS "fk_tenants_seal_light_asset_id"',
    );
    await queryRunner.query(
      'ALTER TABLE "public"."tenants" DROP CONSTRAINT IF EXISTS "fk_tenants_logo_dark_asset_id"',
    );
    await queryRunner.query(
      'ALTER TABLE "public"."tenants" DROP CONSTRAINT IF EXISTS "fk_tenants_logo_light_asset_id"',
    );

    await queryRunner.query(`
      ALTER TABLE "public"."tenants"
        DROP COLUMN IF EXISTS "login_background_dark_asset_id",
        DROP COLUMN IF EXISTS "login_background_light_asset_id",
        DROP COLUMN IF EXISTS "favicon_dark_asset_id",
        DROP COLUMN IF EXISTS "favicon_light_asset_id",
        DROP COLUMN IF EXISTS "seal_dark_asset_id",
        DROP COLUMN IF EXISTS "seal_light_asset_id",
        DROP COLUMN IF EXISTS "logo_dark_asset_id",
        DROP COLUMN IF EXISTS "logo_light_asset_id",
        DROP COLUMN IF EXISTS "login_background_dark_url",
        DROP COLUMN IF EXISTS "login_background_light_url",
        DROP COLUMN IF EXISTS "favicon_dark_url",
        DROP COLUMN IF EXISTS "favicon_light_url"
    `);
  }
}
