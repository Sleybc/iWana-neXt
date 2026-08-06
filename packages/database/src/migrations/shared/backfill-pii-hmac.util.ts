import type { QueryRunner } from 'typeorm';
import {
  decryptAes256Gcm,
  loadAesGcmKeysFromEnv,
} from './backfill-expediente-document-number-hash.util';
import { hmacDocumentNumber, hmacEmail, hmacPhone, loadPiiHashKeyFromEnv } from './pii-hmac.util';

const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 500;

export type BackfillHmacResult = {
  processed: number;
  updated: number;
  skipped: number;
};

export type BackfillHmacOptions = {
  batchSize?: number;
  activeKey?: Buffer;
  previousKey?: Buffer | null;
  hashKey?: Buffer;
  warn?: (message: string) => void;
};

function safeBatchSize(batchSize?: number): number {
  return Math.min(
    Math.max(Math.floor(batchSize ?? DEFAULT_BATCH_SIZE) || DEFAULT_BATCH_SIZE, 1),
    MAX_BATCH_SIZE,
  );
}

/**
 * Backfill `expediente_records.document_number_hmac` desde ciphertext AES.
 * Solo filas con hmac NULL y ciphertext presente. Cero PII en logs.
 */
export async function backfillExpedienteDocumentNumberHmac(
  queryRunner: QueryRunner,
  options: BackfillHmacOptions = {},
): Promise<BackfillHmacResult> {
  let keys: { activeKey: Buffer; previousKey: Buffer | null } | null =
    options.activeKey !== undefined
      ? { activeKey: options.activeKey, previousKey: options.previousKey ?? null }
      : null;
  let hashKey: Buffer | null = options.hashKey ?? null;
  const warn = options.warn ?? (() => undefined);
  const batchSize = safeBatchSize(options.batchSize);

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let afterId: string | null = null;

  for (;;) {
    const params: unknown[] = [batchSize];
    let sql = `
      SELECT id, document_number_encrypted
      FROM expediente_records
      WHERE document_number_hmac IS NULL
        AND document_number_encrypted IS NOT NULL
    `;
    if (afterId) {
      params.unshift(afterId);
      sql += ` AND id > $1 ORDER BY id ASC LIMIT $2`;
    } else {
      sql += ` ORDER BY id ASC LIMIT $1`;
    }

    const batch = (await queryRunner.query(sql, params)) as Array<{
      id: string;
      document_number_encrypted: string;
    }>;

    if (batch.length === 0) {
      break;
    }

    if (!keys) {
      keys = loadAesGcmKeysFromEnv();
    }
    if (!hashKey) {
      hashKey = loadPiiHashKeyFromEnv();
    }

    afterId = batch[batch.length - 1]!.id;

    for (const row of batch) {
      processed += 1;
      try {
        const plaintext = decryptAes256Gcm(
          row.document_number_encrypted,
          keys.activeKey,
          keys.previousKey,
        );
        const digest = hmacDocumentNumber(plaintext, hashKey);
        await queryRunner.query(
          `
            UPDATE expediente_records
            SET document_number_hmac = $1
            WHERE id = $2 AND document_number_hmac IS NULL
          `,
          [digest, row.id],
        );
        updated += 1;
      } catch {
        skipped += 1;
        warn(`No se pudo backfillear document_number_hmac para expediente ${row.id}`);
      }
    }

    if (batch.length < batchSize) {
      break;
    }
  }

  if (processed > 0 && updated === 0) {
    throw new Error(
      `Backfill document_number_hmac no actualizó ninguna fila ` +
        `(processed=${processed}, updated=${updated}, skipped=${skipped}). ` +
        'Revisar MFA_ENCRYPTION_KEY / PII_HASH_KEY; no omitir en silencio.',
    );
  }

  return { processed, updated, skipped };
}

/**
 * Backfill hashes HMAC de subscribers desde columnas cifradas.
 */
export async function backfillSubscriberHmacColumns(
  queryRunner: QueryRunner,
  options: BackfillHmacOptions = {},
): Promise<BackfillHmacResult> {
  let keys: { activeKey: Buffer; previousKey: Buffer | null } | null =
    options.activeKey !== undefined
      ? { activeKey: options.activeKey, previousKey: options.previousKey ?? null }
      : null;
  let hashKey: Buffer | null = options.hashKey ?? null;
  const warn = options.warn ?? (() => undefined);
  const batchSize = safeBatchSize(options.batchSize);

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let afterId: string | null = null;

  for (;;) {
    const params: unknown[] = [batchSize];
    let sql = `
      SELECT id,
             document_number_encrypted,
             email_encrypted,
             phone_encrypted,
             document_number_hmac,
             email_hmac,
             phone_hmac
      FROM subscribers
      WHERE (document_number_hmac IS NULL AND document_number_encrypted IS NOT NULL)
         OR (email_hmac IS NULL AND email_encrypted IS NOT NULL)
         OR (phone_hmac IS NULL AND phone_encrypted IS NOT NULL)
    `;
    if (afterId) {
      params.unshift(afterId);
      sql += ` AND id > $1 ORDER BY id ASC LIMIT $2`;
    } else {
      sql += ` ORDER BY id ASC LIMIT $1`;
    }

    const batch = (await queryRunner.query(sql, params)) as Array<{
      id: string;
      document_number_encrypted: string | null;
      email_encrypted: string | null;
      phone_encrypted: string | null;
      document_number_hmac: string | null;
      email_hmac: string | null;
      phone_hmac: string | null;
    }>;

    if (batch.length === 0) {
      break;
    }

    if (!keys) {
      keys = loadAesGcmKeysFromEnv();
    }
    if (!hashKey) {
      hashKey = loadPiiHashKeyFromEnv();
    }

    afterId = batch[batch.length - 1]!.id;

    for (const row of batch) {
      processed += 1;
      let rowUpdated = false;

      const tryField = async (
        ciphertext: string | null,
        currentHmac: string | null,
        column: 'document_number_hmac' | 'email_hmac' | 'phone_hmac',
        derive: (plaintext: string) => string,
      ): Promise<void> => {
        if (currentHmac !== null || !ciphertext) {
          return;
        }
        try {
          const plaintext = decryptAes256Gcm(ciphertext, keys!.activeKey, keys!.previousKey);
          const digest = derive(plaintext);
          await queryRunner.query(
            `
              UPDATE subscribers
              SET ${column} = $1
              WHERE id = $2 AND ${column} IS NULL
            `,
            [digest, row.id],
          );
          rowUpdated = true;
        } catch {
          warn(`No se pudo backfillear ${column} para subscriber ${row.id}`);
        }
      };

      await tryField(
        row.document_number_encrypted,
        row.document_number_hmac,
        'document_number_hmac',
        (p) => hmacDocumentNumber(p, hashKey!),
      );
      await tryField(row.email_encrypted, row.email_hmac, 'email_hmac', (p) =>
        hmacEmail(p, hashKey!),
      );
      await tryField(row.phone_encrypted, row.phone_hmac, 'phone_hmac', (p) =>
        hmacPhone(p, hashKey!),
      );

      if (rowUpdated) {
        updated += 1;
      } else {
        skipped += 1;
      }
    }

    if (batch.length < batchSize) {
      break;
    }
  }

  return { processed, updated, skipped };
}

/**
 * Backfill `users.email_hmac` desde email en texto plano (H-14).
 * No requiere MFA_ENCRYPTION_KEY.
 */
export async function backfillUsersEmailHmac(
  queryRunner: QueryRunner,
  options: Pick<BackfillHmacOptions, 'batchSize' | 'hashKey' | 'warn'> = {},
): Promise<BackfillHmacResult> {
  let hashKey: Buffer | null = options.hashKey ?? null;
  const warn = options.warn ?? (() => undefined);
  const batchSize = safeBatchSize(options.batchSize);

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let afterId: string | null = null;

  for (;;) {
    const params: unknown[] = [batchSize];
    let sql = `
      SELECT id, email
      FROM users
      WHERE email_hmac IS NULL
        AND email IS NOT NULL
        AND email <> ''
    `;
    if (afterId) {
      params.unshift(afterId);
      sql += ` AND id > $1 ORDER BY id ASC LIMIT $2`;
    } else {
      sql += ` ORDER BY id ASC LIMIT $1`;
    }

    const batch = (await queryRunner.query(sql, params)) as Array<{ id: string; email: string }>;

    if (batch.length === 0) {
      break;
    }

    if (!hashKey) {
      hashKey = loadPiiHashKeyFromEnv();
    }

    afterId = batch[batch.length - 1]!.id;

    for (const row of batch) {
      processed += 1;
      try {
        const digest = hmacEmail(row.email, hashKey);
        await queryRunner.query(
          `
            UPDATE users
            SET email_hmac = $1
            WHERE id = $2 AND email_hmac IS NULL
          `,
          [digest, row.id],
        );
        updated += 1;
      } catch {
        skipped += 1;
        warn(`No se pudo backfillear email_hmac para user ${row.id}`);
      }
    }

    if (batch.length < batchSize) {
      break;
    }
  }

  if (processed > 0 && updated === 0) {
    throw new Error(
      `Backfill users.email_hmac no actualizó ninguna fila ` +
        `(processed=${processed}, updated=${updated}, skipped=${skipped}). ` +
        'Revisar PII_HASH_KEY; no omitir en silencio.',
    );
  }

  return { processed, updated, skipped };
}

/**
 * Backfill `public.platform_users.email_hmac` desde email cifrado AES-GCM.
 */
export async function backfillPlatformUsersEmailHmac(
  queryRunner: QueryRunner,
  options: BackfillHmacOptions = {},
): Promise<BackfillHmacResult> {
  let keys: { activeKey: Buffer; previousKey: Buffer | null } | null =
    options.activeKey !== undefined
      ? { activeKey: options.activeKey, previousKey: options.previousKey ?? null }
      : null;
  let hashKey: Buffer | null = options.hashKey ?? null;
  const warn = options.warn ?? (() => undefined);
  const batchSize = safeBatchSize(options.batchSize);

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let afterId: string | null = null;

  for (;;) {
    const params: unknown[] = [batchSize];
    let sql = `
      SELECT id, email
      FROM public.platform_users
      WHERE email_hmac IS NULL
        AND email IS NOT NULL
        AND email <> ''
    `;
    if (afterId) {
      params.unshift(afterId);
      sql += ` AND id > $1 ORDER BY id ASC LIMIT $2`;
    } else {
      sql += ` ORDER BY id ASC LIMIT $1`;
    }

    const batch = (await queryRunner.query(sql, params)) as Array<{ id: string; email: string }>;

    if (batch.length === 0) {
      break;
    }

    if (!keys) {
      keys = loadAesGcmKeysFromEnv();
    }
    if (!hashKey) {
      hashKey = loadPiiHashKeyFromEnv();
    }

    afterId = batch[batch.length - 1]!.id;

    for (const row of batch) {
      processed += 1;
      try {
        const plaintext = decryptAes256Gcm(row.email, keys.activeKey, keys.previousKey);
        const digest = hmacEmail(plaintext, hashKey);
        await queryRunner.query(
          `
            UPDATE public.platform_users
            SET email_hmac = $1
            WHERE id = $2 AND email_hmac IS NULL
          `,
          [digest, row.id],
        );
        updated += 1;
      } catch {
        skipped += 1;
        warn(`No se pudo backfillear email_hmac para platform_user ${row.id}`);
      }
    }

    if (batch.length < batchSize) {
      break;
    }
  }

  if (processed > 0 && updated === 0) {
    throw new Error(
      `Backfill platform_users.email_hmac no actualizó ninguna fila ` +
        `(processed=${processed}, updated=${updated}, skipped=${skipped}). ` +
        'Revisar MFA_ENCRYPTION_KEY / PII_HASH_KEY; no omitir en silencio.',
    );
  }

  return { processed, updated, skipped };
}
