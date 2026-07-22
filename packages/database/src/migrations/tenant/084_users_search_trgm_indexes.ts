import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 084 — MOD04 Ola C / H-05 (D-2=A).
 *
 * Índices GIN `gin_trgm_ops` sobre columnas de búsqueda de `users`.
 * Requiere extensión `pg_trgm` (migración public `018_enable_pg_trgm`).
 *
 * Idempotente y reversible. No altera datos.
 */
export class UsersSearchTrgmIndexes0840000000000 implements MigrationInterface {
  name = 'UsersSearchTrgmIndexes0840000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // La extensión vive en `public`; el runner tenant fija search_path al schema.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_users_first_name_trgm
        ON users USING GIN (first_name public.gin_trgm_ops)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_users_last_name_trgm
        ON users USING GIN (last_name public.gin_trgm_ops)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email_trgm
        ON users USING GIN (email public.gin_trgm_ops)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_users_job_title_trgm
        ON users USING GIN (job_title public.gin_trgm_ops)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_job_title_trgm`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_email_trgm`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_last_name_trgm`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_first_name_trgm`);
  }
}
