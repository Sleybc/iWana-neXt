import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 004 — Reemplaza display_name por first_name + last_name en platform_users.
 *
 * Decisión de diseño: se prefieren campos semánticos separados a un nombre compuesto
 * para facilitar ordenamiento, búsqueda y presentación contextual en la UI.
 */
export class ReplaceDisplayNameWithFirstLastName1742300000000 implements MigrationInterface {
  name = 'ReplaceDisplayNameWithFirstLastName1742300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
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

  public async down(queryRunner: QueryRunner): Promise<void> {
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
