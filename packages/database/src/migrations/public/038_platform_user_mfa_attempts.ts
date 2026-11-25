import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 038 — TOTP de un solo uso y freno del segundo factor en plataforma
 * (spec 2026-11-25 §3.2 y §3.3).
 *
 * Schema: public
 * Reversible: sí. Aditiva, sin recorrido de datos; el `down` descarta solo estado efímero.
 */
export class PlatformUserMfaAttempts1784419226000 implements MigrationInterface {
  name = 'PlatformUserMfaAttempts1784419226000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "public"."platform_users"
         ADD COLUMN "mfa_last_used_step" integer,
         ADD COLUMN "mfa_failed_attempts" integer NOT NULL DEFAULT 0,
         ADD COLUMN "mfa_locked_until" timestamptz`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "public"."platform_users"
         DROP COLUMN "mfa_locked_until",
         DROP COLUMN "mfa_failed_attempts",
         DROP COLUMN "mfa_last_used_step"`,
    );
  }
}
