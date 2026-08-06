import { MigrationInterface, QueryRunner } from 'typeorm';

const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

/**
 * Migración pública 022 (SEC-P1): **contract** de `platform_users.email_hash`.
 *
 * Retira la columna SHA-256 que la 021 dejó como respaldo, junto con su UNIQUE
 * y su índice. Es la contraparte pública de la tenant 109 y se difiere por la
 * misma variable: mientras no se aplique, volver al binario pre-SEC-P1 no exige
 * restaurar backup. Aplicarla cierra esa puerta y retira los últimos digests
 * enumerables de plataforma (S-1).
 *
 * Reversible solo con `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN`: el `down` recrea
 * la columna con los digests **HMAC**, no con los SHA-256 originales. Queda
 * poblada y con UNIQUE, pero un binario pre-SEC-P1 —que calcula SHA-256— no
 * encontraría a ningún usuario y el login de plataforma se rompe en silencio.
 */
export class DropPlatformUsersEmailHash1784419210000 implements MigrationInterface {
  // El sufijo es el timestamp que TypeORM usa para ordenar; posterior a la 021
  // (1784419209000), no el número de archivo.
  name = 'DropPlatformUsersEmailHash1784419210000';

  deferredBy = 'IWANA_APPLY_PII_CONTRACT';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Guardián: no retirar el respaldo mientras haya filas sin su equivalente
    // HMAC. Espeja el de la tenant 109.
    const pending = (await queryRunner.query(`
      SELECT COUNT(*)::int AS total
      FROM "public"."platform_users"
      WHERE "email_hmac" IS NULL
    `)) as Array<{ total: number }>;

    if ((pending[0]?.total ?? 0) > 0) {
      throw new Error(
        `022 bloqueada: ${pending[0]!.total} platform_user(s) sin email_hmac. ` +
          'Dropear email_hash ahora los dejaría sin ninguna vía de búsqueda. ' +
          'Reejecutar la 021 / revisar PII_HASH_KEY.',
      );
    }

    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_platform_users_email_hash"`);
    await queryRunner.query(`
      ALTER TABLE "public"."platform_users"
      DROP CONSTRAINT IF EXISTS "uq_platform_users_email_hash"
    `);
    await queryRunner.query(`
      ALTER TABLE "public"."platform_users"
      DROP COLUMN IF EXISTS "email_hash"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (process.env[DESTRUCTIVE_DOWN_ENV_VAR] !== 'true') {
      throw new Error(
        `Rollback de DropPlatformUsersEmailHash1784419210000 bloqueado: ` +
          `recrear "email_hash" con digests HMAC deja la columna poblada pero ` +
          `inservible para un binario pre-SEC-P1 (calcula SHA-256), que dejaría ` +
          `de encontrar a todo usuario de plataforma. Restaurar los digests ` +
          `originales exige backup. Exporte ${DESTRUCTIVE_DOWN_ENV_VAR}=true de ` +
          `forma explícita.`,
      );
    }

    await queryRunner.query(`
      ALTER TABLE "public"."platform_users"
      ADD COLUMN IF NOT EXISTS "email_hash" VARCHAR(64) NULL
    `);
    await queryRunner.query(`
      UPDATE "public"."platform_users"
      SET "email_hash" = "email_hmac"
      WHERE "email_hash" IS NULL AND "email_hmac" IS NOT NULL
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = '"public"."platform_users"'::regclass
            AND conname = 'uq_platform_users_email_hash'
        ) THEN
          ALTER TABLE "public"."platform_users"
          ADD CONSTRAINT "uq_platform_users_email_hash" UNIQUE ("email_hash");
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_platform_users_email_hash"
      ON "public"."platform_users" ("email_hash")
    `);
  }
}
