import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 218: último paso TOTP usado por cada usuario (código de un solo uso,
 * spec 2026-11-25 §3.2). Aditiva y sin recorrido de datos; el `down` descarta estado efímero.
 */
export class AddUserMfaLastUsedStep2180000000218 implements MigrationInterface {
  name = 'AddUserMfaLastUsedStep2180000000218';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users ADD COLUMN mfa_last_used_step integer`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users DROP COLUMN mfa_last_used_step`);
  }
}
