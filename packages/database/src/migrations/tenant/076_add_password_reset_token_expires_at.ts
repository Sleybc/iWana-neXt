import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 076 (SEC-03): separa el TTL del token forgot-password del TTL
 * de la credencial temporal.
 *
 * - `password_reset_expires_at` queda solo para credencial temporal (24 h).
 * - `password_reset_token_expires_at` es el TTL del token de reset (1 h).
 *
 * Reversible: sí.
 */
export class AddPasswordResetTokenExpiresAt0760000000000 implements MigrationInterface {
  name = 'AddPasswordResetTokenExpiresAt0760000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "password_reset_token_expires_at" TIMESTAMPTZ NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        DROP COLUMN IF EXISTS "password_reset_token_expires_at"
    `);
  }
}
