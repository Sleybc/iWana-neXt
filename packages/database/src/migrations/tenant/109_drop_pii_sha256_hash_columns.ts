import { MigrationInterface, QueryRunner } from 'typeorm';

const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

/**
 * Migración 109 (SEC-P1 / E3): contract — retira columnas SHA-256 (`*_hash`).
 *
 * Tras 108 el runtime lee/escribe `*_hmac`. Esta migración elimina:
 * - subscribers.document_number_hash, email_hash, phone_hash (+ índices)
 * - expediente_records.document_number_hash (+ índice)
 * - users.email_hash (+ unique + índice)
 *
 * Schema: tenant. Reversible solo con IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN
 * (recrea columnas hash vacías — no restaura digests SHA-256).
 */
export class DropPiiSha256HashColumns1090000000000 implements MigrationInterface {
  name = 'DropPiiSha256HashColumns1090000000000';

  transactional = true;

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Guardián: no dropear hash si quedan filas con ciphertext sin hmac.
    const pendingExpediente = (await queryRunner.query(`
      SELECT COUNT(*)::int AS total
      FROM expediente_records
      WHERE document_number_hmac IS NULL
        AND document_number_encrypted IS NOT NULL
    `)) as Array<{ total: number }>;
    if ((pendingExpediente[0]?.total ?? 0) > 0) {
      throw new Error(
        `109 bloqueada: ${pendingExpediente[0]!.total} expediente(s) sin document_number_hmac. ` +
          'Reejecutar 108 / revisar claves.',
      );
    }

    const pendingUsers = (await queryRunner.query(`
      SELECT COUNT(*)::int AS total FROM users WHERE email_hmac IS NULL
    `)) as Array<{ total: number }>;
    if ((pendingUsers[0]?.total ?? 0) > 0) {
      throw new Error(
        `109 bloqueada: ${pendingUsers[0]!.total} user(s) sin email_hmac. Reejecutar 108.`,
      );
    }

    await queryRunner.query(`DROP INDEX IF EXISTS idx_subscribers_phone_hash`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_subscribers_email_hash`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_subscribers_doc_hash`);
    await queryRunner.query(`
      ALTER TABLE subscribers
      DROP COLUMN IF EXISTS phone_hash,
      DROP COLUMN IF EXISTS email_hash,
      DROP COLUMN IF EXISTS document_number_hash
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS idx_expediente_doc_hash`);
    await queryRunner.query(
      `ALTER TABLE expediente_records DROP COLUMN IF EXISTS document_number_hash`,
    );

    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_email_hash`);
    await queryRunner.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS uq_users_email_hash`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS email_hash`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (process.env[DESTRUCTIVE_DOWN_ENV_VAR] !== 'true') {
      throw new Error(
        `Rollback de DropPiiSha256HashColumns1090000000000 bloqueado: ` +
          `recrear columnas SHA-256 vacías es destructivo para búsquedas. ` +
          `Exporte ${DESTRUCTIVE_DOWN_ENV_VAR}=true de forma explícita.`,
      );
    }

    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS email_hash VARCHAR(64) NULL
    `);
    await queryRunner.query(`
      UPDATE users SET email_hash = email_hmac WHERE email_hash IS NULL AND email_hmac IS NOT NULL
    `);
    await queryRunner.query(`ALTER TABLE users ALTER COLUMN email_hash SET NOT NULL`);
    await queryRunner.query(`
      ALTER TABLE users ADD CONSTRAINT uq_users_email_hash UNIQUE (email_hash)
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_users_email_hash ON users (email_hash)`,
    );

    await queryRunner.query(`
      ALTER TABLE expediente_records
      ADD COLUMN IF NOT EXISTS document_number_hash VARCHAR(64) NULL
    `);
    await queryRunner.query(`
      UPDATE expediente_records
      SET document_number_hash = document_number_hmac
      WHERE document_number_hash IS NULL AND document_number_hmac IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_expediente_doc_hash
      ON expediente_records (document_number_hash)
      WHERE document_number_hash IS NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE subscribers
      ADD COLUMN IF NOT EXISTS document_number_hash VARCHAR(64) NULL,
      ADD COLUMN IF NOT EXISTS email_hash VARCHAR(64) NULL,
      ADD COLUMN IF NOT EXISTS phone_hash VARCHAR(64) NULL
    `);
    await queryRunner.query(`
      UPDATE subscribers SET
        document_number_hash = COALESCE(document_number_hash, document_number_hmac),
        email_hash = COALESCE(email_hash, email_hmac),
        phone_hash = COALESCE(phone_hash, phone_hmac)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_subscribers_doc_hash
      ON subscribers (document_number_hash) WHERE document_number_hash IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_subscribers_email_hash
      ON subscribers (email_hash) WHERE email_hash IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_subscribers_phone_hash
      ON subscribers (phone_hash) WHERE phone_hash IS NOT NULL
    `);
  }
}
