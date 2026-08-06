import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  backfillExpedienteDocumentNumberHmac,
  backfillSubscriberHmacColumns,
  backfillUsersEmailHmac,
} from '../shared/backfill-pii-hmac.util';

/**
 * Migración 108 (SEC-P1 / E2): expand — columnas `*_hmac` + backfill.
 *
 * Añade en paralelo a las columnas SHA-256 (`*_hash`):
 * - subscribers: document_number_hmac, email_hmac, phone_hmac
 * - expediente_records: document_number_hmac
 * - users: email_hmac
 *
 * Backfill: descifra PII solo en memoria (lotes); nunca loguea plaintext.
 * Requiere `PII_HASH_KEY` si hay filas pendientes; `MFA_ENCRYPTION_KEY` si hay
 * ciphertext de subscribers/expediente.
 *
 * Schema: tenant (search_path). Reversible: sí (drop de columnas hmac).
 */
export class AddPiiHmacColumns1080000000000 implements MigrationInterface {
  name = 'AddPiiHmacColumns1080000000000';

  transactional = true;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE subscribers
      ADD COLUMN IF NOT EXISTS document_number_hmac VARCHAR(64) NULL,
      ADD COLUMN IF NOT EXISTS email_hmac VARCHAR(64) NULL,
      ADD COLUMN IF NOT EXISTS phone_hmac VARCHAR(64) NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_subscribers_doc_hmac
      ON subscribers (document_number_hmac)
      WHERE document_number_hmac IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_subscribers_email_hmac
      ON subscribers (email_hmac)
      WHERE email_hmac IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_subscribers_phone_hmac
      ON subscribers (phone_hmac)
      WHERE phone_hmac IS NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE expediente_records
      ADD COLUMN IF NOT EXISTS document_number_hmac VARCHAR(64) NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_expediente_doc_hmac
      ON expediente_records (document_number_hmac)
      WHERE document_number_hmac IS NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS email_hmac VARCHAR(64) NULL
    `);

    const warn = (message: string): void => {
      process.stderr.write(`${message}\n`);
    };

    const usersResult = await backfillUsersEmailHmac(queryRunner, { warn });
    process.stderr.write(
      `108 backfill users.email_hmac: processed=${usersResult.processed} ` +
        `updated=${usersResult.updated} skipped=${usersResult.skipped}\n`,
    );

    // NOT NULL + UNIQUE solo tras backfill completo.
    const pendingUsers = (await queryRunner.query(`
      SELECT COUNT(*)::int AS total
      FROM users
      WHERE email_hmac IS NULL
    `)) as Array<{ total: number }>;
    if ((pendingUsers[0]?.total ?? 0) > 0) {
      throw new Error(
        `108: quedan ${pendingUsers[0]!.total} users sin email_hmac tras backfill. ` +
          'No se puede imponer NOT NULL.',
      );
    }

    await queryRunner.query(`
      ALTER TABLE users
      ALTER COLUMN email_hmac SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE users
      ADD CONSTRAINT uq_users_email_hmac UNIQUE (email_hmac)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email_hmac ON users (email_hmac)
    `);

    const expedienteResult = await backfillExpedienteDocumentNumberHmac(queryRunner, { warn });
    process.stderr.write(
      `108 backfill expediente.document_number_hmac: processed=${expedienteResult.processed} ` +
        `updated=${expedienteResult.updated} skipped=${expedienteResult.skipped}\n`,
    );

    const subscribersResult = await backfillSubscriberHmacColumns(queryRunner, { warn });
    process.stderr.write(
      `108 backfill subscribers.*_hmac: processed=${subscribersResult.processed} ` +
        `updated=${subscribersResult.updated} skipped=${subscribersResult.skipped}\n`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_email_hmac`);
    await queryRunner.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS uq_users_email_hmac`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS email_hmac`);

    await queryRunner.query(`DROP INDEX IF EXISTS idx_expediente_doc_hmac`);
    await queryRunner.query(
      `ALTER TABLE expediente_records DROP COLUMN IF EXISTS document_number_hmac`,
    );

    await queryRunner.query(`DROP INDEX IF EXISTS idx_subscribers_phone_hmac`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_subscribers_email_hmac`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_subscribers_doc_hmac`);
    await queryRunner.query(`
      ALTER TABLE subscribers
      DROP COLUMN IF EXISTS phone_hmac,
      DROP COLUMN IF EXISTS email_hmac,
      DROP COLUMN IF EXISTS document_number_hmac
    `);
  }
}
