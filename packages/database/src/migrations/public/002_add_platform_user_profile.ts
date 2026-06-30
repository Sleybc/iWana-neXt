import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migracion 002 — Extension de perfil para usuarios de plataforma.
 *
 * Agrega campos operativos de perfil en public.platform_users para habilitar
 * edicion de perfil y preferencias desde la UI administrativa.
 */
export class AddPlatformUserProfile1742100000000 implements MigrationInterface {
  name = 'AddPlatformUserProfile1742100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
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

  public async down(queryRunner: QueryRunner): Promise<void> {
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
