import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  backfillExpedienteDocumentNumberHmac,
  backfillSubscriberHmacColumns,
  backfillUsersEmailHmac,
} from '../shared/backfill-pii-hmac.util';

const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

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
 * - `transactional = true` (ADR-066): DML + DDL atómicos en una TX del runner.
 *   Los `CREATE INDEX` no usan CONCURRENTLY; con la TX abierta retienen SHARE
 *   (bloquean escrituras) hasta el COMMIT, junto con SET NOT NULL + UNIQUE en users.
 * - Umbral operativo (reltuples / relpages, tenant más grande):
 *   - todas users|subscribers|expediente_records < ~50k → KEEP transactional=true
 *   - alguna > ~100k → SWITCH a transactional=false + CREATE INDEX CONCURRENTLY
 *     (separar DML vs índices: ADR-066 prohíbe DML en migración no transaccional)
 *   - zona gris 50k–100k → consultar orquestador antes de cambiar flag
 * - Medición 2026-08-06 (dev local, 10 ACTIVE): peak reltuples=4; cells≥50k=0.
 *   Se mantiene transactional=true.
 *
 * Schema: tenant (search_path). Reversible: sí (drop de columnas hmac). Libera
 * el NOT NULL de `users.email_hash` para que el estado intermedio —108 aplicada,
 * 109 diferida— acepte altas de usuario; el `down` lo restituye y exige
 * `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN` si encuentra filas creadas en ese
 * intervalo.
 */
export class AddPiiHmacColumns1080000000000 implements MigrationInterface {
  name = 'AddPiiHmacColumns1080000000000';

  /** Default ADR-066: atomicidad DDL↔registro; umbral ~50k filas (ver cabecera). */
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
    // ADD CONSTRAINT no admite IF NOT EXISTS: condicionarlo mantiene el `up`
    // reejecutable (reintento tras fallo parcial en otro tenant del lote).
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          -- conrelid resuelve 'users' por search_path: el nombre de constraint
          -- se repite en cada schema de tenant, filtrar solo por conname haría
          -- que un tenant se saltara el UNIQUE porque otro ya lo tiene.
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'users'::regclass AND conname = 'uq_users_email_hmac'
        ) THEN
          ALTER TABLE users ADD CONSTRAINT uq_users_email_hmac UNIQUE (email_hmac);
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email_hmac ON users (email_hmac)
    `);

    // El runtime ya no escribe email_hash, pero la columna sigue existiendo
    // hasta la 109 (diferida) como respaldo para revertir sin backup. Sin
    // liberar el NOT NULL, el primer INSERT de usuario en ese estado
    // intermedio fallaría.
    await queryRunner.query(`
      ALTER TABLE users
      ALTER COLUMN email_hash DROP NOT NULL
    `);

    const expedienteResult = await backfillExpedienteDocumentNumberHmac(queryRunner, { warn });
    process.stderr.write(
      `108 backfill expediente.document_number_hmac: processed=${expedienteResult.processed} ` +
        `updated=${expedienteResult.updated} skipped=${expedienteResult.skipped}\n`,
    );

    const subscribersResult = await backfillSubscriberHmacColumns(queryRunner, { warn });
    process.stderr.write(
      `108 backfill subscribers.*_hmac: processed=${subscribersResult.processed} ` +
        `updated=${subscribersResult.updated} skipped=${subscribersResult.skipped} ` +
        `failed=${subscribersResult.failed}\n`,
    );
    if (subscribersResult.failed > 0) {
      // No aborta: un ciphertext corrupto aislado no debe bloquear el tenant.
      // Quien sí bloquea es la 109, que se niega a dropear las columnas SHA-256
      // mientras queden filas con ciphertext y sin HMAC.
      process.stderr.write(
        `108 AVISO: ${subscribersResult.failed} campo(s) de subscribers sin HMAC. ` +
          'La 109 quedará bloqueada hasta resolverlo.\n',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restituye el NOT NULL que liberó el `up`. Los usuarios creados mientras la
    // 109 estuvo diferida no tienen email_hash: revertir exige decidir qué hacer
    // con ellos, y esa decisión no puede tomarse en silencio.
    const orphanUsers = (await queryRunner.query(`
      SELECT COUNT(*)::int AS total
      FROM users
      WHERE email_hash IS NULL
        AND email_hmac IS NOT NULL
    `)) as Array<{ total: number }>;
    const orphanCount = orphanUsers[0]?.total ?? 0;

    if (orphanCount > 0) {
      if (process.env[DESTRUCTIVE_DOWN_ENV_VAR] !== 'true') {
        throw new Error(
          `Rollback de AddPiiHmacColumns1080000000000 bloqueado: ${orphanCount} user(s) ` +
            `creados tras la 108 no tienen email_hash SHA-256 y no puede recalcularse ` +
            `desde el HMAC. Rellenarlos con el digest HMAC los dejaría inencontrables ` +
            `para un binario pre-SEC-P1. Restaure backup, o exporte ` +
            `${DESTRUCTIVE_DOWN_ENV_VAR}=true para aceptar esas filas degradadas.`,
        );
      }

      await queryRunner.query(`
        UPDATE users
        SET email_hash = email_hmac
        WHERE email_hash IS NULL AND email_hmac IS NOT NULL
      `);
    }

    await queryRunner.query(`ALTER TABLE users ALTER COLUMN email_hash SET NOT NULL`);

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
