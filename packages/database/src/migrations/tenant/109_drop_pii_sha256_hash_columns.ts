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
 *
 * **Diferida** (`IWANA_APPLY_PII_CONTRACT`): es el contract del expand/contract
 * que abre la 108. Mientras no se aplique, las columnas `*_hash` conservan los
 * digests SHA-256 originales y volver al binario pre-SEC-P1 no exige restaurar
 * backup. Aplicarla cierra esa puerta — y también retira los últimos hashes
 * enumerables (S-1), así que no debe quedarse diferida indefinidamente.
 */
export class DropPiiSha256HashColumns1090000000000 implements MigrationInterface {
  name = 'DropPiiSha256HashColumns1090000000000';

  transactional = true;

  deferredBy = 'IWANA_APPLY_PII_CONTRACT';

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

    // Subscribers: el backfill de 108 tolera fallos por campo (una fila con 3
    // campos donde falla 1 igual cuenta como actualizada). Sin este guardián el
    // DROP de más abajo se lleva los digests SHA-256 de filas cuyo HMAC quedó
    // NULL, y la búsqueda por documento/email/teléfono de esos suscriptores
    // queda rota sin forma de recalcularla si la clave AES ya no está.
    const pendingSubscribers = (await queryRunner.query(`
      SELECT
        COUNT(*) FILTER (
          WHERE document_number_hmac IS NULL AND document_number_encrypted IS NOT NULL
        )::int AS doc,
        COUNT(*) FILTER (WHERE email_hmac IS NULL AND email_encrypted IS NOT NULL)::int AS email,
        COUNT(*) FILTER (WHERE phone_hmac IS NULL AND phone_encrypted IS NOT NULL)::int AS phone
      FROM subscribers
    `)) as Array<{ doc: number; email: number; phone: number }>;
    const subscriberGaps = pendingSubscribers[0] ?? { doc: 0, email: 0, phone: 0 };
    const totalSubscriberGaps = subscriberGaps.doc + subscriberGaps.email + subscriberGaps.phone;
    if (totalSubscriberGaps > 0) {
      throw new Error(
        `109 bloqueada: subscribers con ciphertext pero sin HMAC ` +
          `(document_number=${subscriberGaps.doc}, email=${subscriberGaps.email}, ` +
          `phone=${subscriberGaps.phone}). Dropear las columnas SHA-256 ahora ` +
          'perdería su búsqueda de forma irrecuperable. Reejecutar 108 con ' +
          'MFA_ENCRYPTION_KEY (y MFA_ENCRYPTION_KEY_PREVIOUS si hubo rotación).',
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
