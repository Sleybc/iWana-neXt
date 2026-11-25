import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 219: inicio de la sesión en cada refresh token (vida absoluta, spec 2026-11-25 §3).
 * Aditiva, sin backfill: las filas previas toman el inicio conocido de su familia al rotar.
 */
export class AddRefreshTokenFamilyStartedAt2190000000219 implements MigrationInterface {
  name = 'AddRefreshTokenFamilyStartedAt2190000000219';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE refresh_tokens ADD COLUMN family_started_at timestamptz`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE refresh_tokens DROP COLUMN family_started_at`);
  }
}
