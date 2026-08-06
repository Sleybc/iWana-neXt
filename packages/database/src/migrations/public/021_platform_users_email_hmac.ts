import { MigrationInterface, QueryRunner } from 'typeorm';
import { backfillPlatformUsersEmailHmac } from '../shared/backfill-pii-hmac.util';

/**
 * Migración pública 021 (SEC-P1): expand/contract de `platform_users.email_hash`.
 *
 * Añade `email_hmac`, backfill desde email (texto plano / cifrado legacy ya
 * normalizado en columna email según H-14 de platform), impone NOT NULL+UNIQUE,
 * y retira `email_hash` SHA-256.
 *
 * Requiere `PII_HASH_KEY`. Reversible: recrea email_hash desde email_hmac
 * (digests HMAC, no SHA-256 original).
 */
export class PlatformUsersEmailHmac0210000000000 implements MigrationInterface {
  name = 'PlatformUsersEmailHmac0210000000000';

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
    await queryRunner.query(`
      ALTER TABLE "public"."platform_users"
      ADD CONSTRAINT "uq_platform_users_email_hmac" UNIQUE ("email_hmac")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_platform_users_email_hmac"
      ON "public"."platform_users" ("email_hmac")
    `);

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
      ALTER TABLE "public"."platform_users"
      ALTER COLUMN "email_hash" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "public"."platform_users"
      ADD CONSTRAINT "uq_platform_users_email_hash" UNIQUE ("email_hash")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_platform_users_email_hash"
      ON "public"."platform_users" ("email_hash")
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
