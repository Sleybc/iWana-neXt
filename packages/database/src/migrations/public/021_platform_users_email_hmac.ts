import { MigrationInterface, QueryRunner } from 'typeorm';
import { backfillPlatformUsersEmailHmac } from '../shared/backfill-pii-hmac.util';

const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';
const LEGACY_MIGRATION_NAME = 'PlatformUsersEmailHmac0210000000000';

/**
 * Migración pública 021 (SEC-P1): **expand** de `platform_users.email_hash`.
 *
 * Añade `email_hmac`, backfill descifrando `platform_users.email` (AES-256-GCM,
 * ver `PlatformUser.email`), impone NOT NULL+UNIQUE y libera el NOT NULL de
 * `email_hash`, que sobrevive como respaldo hasta la 022 (**contract**,
 * diferida por `IWANA_APPLY_PII_CONTRACT`).
 *
 * Requiere `PII_HASH_KEY` y `MFA_ENCRYPTION_KEY` (para descifrar el email).
 *
 * Reversible: sí. Mientras la 022 no se aplique, revertir esta migración
 * devuelve `email_hash` a NOT NULL con sus digests SHA-256 originales intactos
 * — no hace falta backup. La única excepción son las altas ocurridas en ese
 * intervalo, que el `down` no puede reconstruir.
 */
export class PlatformUsersEmailHmac1784419209000 implements MigrationInterface {
  // El sufijo es el timestamp que TypeORM usa para ordenar migraciones. Debe
  // ser posterior a 020 (1784419208000), no el número de archivo 021: con un
  // sufijo corto (`0210000000000` = 2.1e11) esta migración se ordenaba ANTES
  // de 001_create_public_schema y rompía todo bootstrap limpio.
  name = 'PlatformUsersEmailHmac1784419209000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "public"."platform_users"
      ADD COLUMN IF NOT EXISTS "email_hmac" VARCHAR(64) NULL
    `);

    const warn = (message: string): void => {
      process.stderr.write(`${message}\n`);
    };

    const result = await backfillPlatformUsersEmailHmac(queryRunner, { warn });
    process.stderr.write(
      `021 backfill platform_users.email_hmac: processed=${result.processed} ` +
        `updated=${result.updated} skipped=${result.skipped}\n`,
    );

    const pending = (await queryRunner.query(`
      SELECT COUNT(*)::int AS total
      FROM public.platform_users
      WHERE email_hmac IS NULL
    `)) as Array<{ total: number }>;
    if ((pending[0]?.total ?? 0) > 0) {
      throw new Error(
        `021: quedan ${pending[0]!.total} platform_users sin email_hmac. Revisar PII_HASH_KEY.`,
      );
    }

    await queryRunner.query(`
      ALTER TABLE "public"."platform_users"
      ALTER COLUMN "email_hmac" SET NOT NULL
    `);
    // Idempotente: este `up` vuelve a ejecutarse en schemas que registraron la
    // migración bajo LEGACY_MIGRATION_NAME, y ADD CONSTRAINT no admite IF NOT EXISTS.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = '"public"."platform_users"'::regclass
            AND conname = 'uq_platform_users_email_hmac'
        ) THEN
          ALTER TABLE "public"."platform_users"
          ADD CONSTRAINT "uq_platform_users_email_hmac" UNIQUE ("email_hmac");
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_platform_users_email_hmac"
      ON "public"."platform_users" ("email_hmac")
    `);

    // El runtime ya no escribe email_hash, pero la columna sobrevive hasta la
    // 022 (diferida) conservando sus digests SHA-256: es lo que permite volver
    // al binario pre-SEC-P1 sin restaurar backup. Liberar el NOT NULL es lo que
    // hace operable ese estado intermedio — de lo contrario, el alta de un
    // platform_user fallaría. El UNIQUE puede quedarse: en PostgreSQL los NULL
    // no colisionan entre sí.
    //
    // Condicionado a que la columna exista: en una base limpia la crea la 001,
    // pero una base donde la 022 ya corrió (o un drift la dejó post-contract)
    // no tiene email_hash y este `up` reejecutado no debe abortar.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'platform_users'
            AND column_name = 'email_hash'
        ) THEN
          ALTER TABLE "public"."platform_users"
          ALTER COLUMN "email_hash" DROP NOT NULL;
        END IF;
      END $$;
    `);

    // Retira el registro del nombre corto anterior después de aplicar el DDL:
    // el registro no queda con dos dueños lógicos de la misma migración y el
    // revert sigue siendo determinista (mismo patrón que la 020).
    await queryRunner.query(`DELETE FROM "public"."typeorm_migrations" WHERE "name" = $1`, [
      LEGACY_MIGRATION_NAME,
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Este `down` ya no destruye nada: la 022 es quien retira `email_hash`, así
    // que aquí la columna sigue con sus digests SHA-256 intactos. Lo único que
    // hay que decidir son los platform_users dados de alta mientras la 022
    // estuvo diferida, que no tienen SHA-256 y no pueden recalcularlo.
    const orphans = (await queryRunner.query(`
      SELECT COUNT(*)::int AS total
      FROM "public"."platform_users"
      WHERE "email_hash" IS NULL
        AND "email_hmac" IS NOT NULL
    `)) as Array<{ total: number }>;
    const orphanCount = orphans[0]?.total ?? 0;

    if (orphanCount > 0) {
      if (process.env[DESTRUCTIVE_DOWN_ENV_VAR] !== 'true') {
        throw new Error(
          `Rollback de PlatformUsersEmailHmac1784419209000 bloqueado: ${orphanCount} ` +
            `platform_user(s) creados tras la 021 no tienen "email_hash" SHA-256. ` +
            `Rellenarlos con el digest HMAC los dejaría inencontrables para un ` +
            `binario pre-SEC-P1 y no podrían iniciar sesión. Restaure backup, o ` +
            `exporte ${DESTRUCTIVE_DOWN_ENV_VAR}=true para aceptar esas filas ` +
            `degradadas.`,
        );
      }

      await queryRunner.query(`
        UPDATE "public"."platform_users"
        SET "email_hash" = "email_hmac"
        WHERE "email_hash" IS NULL AND "email_hmac" IS NOT NULL
      `);
    }

    await queryRunner.query(`
      ALTER TABLE "public"."platform_users"
      ALTER COLUMN "email_hash" SET NOT NULL
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_platform_users_email_hmac"`);
    await queryRunner.query(`
      ALTER TABLE "public"."platform_users"
      DROP CONSTRAINT IF EXISTS "uq_platform_users_email_hmac"
    `);
    await queryRunner.query(`
      ALTER TABLE "public"."platform_users"
      DROP COLUMN IF EXISTS "email_hmac"
    `);
  }
}
