import * as crypto from 'crypto';
import type { QueryRunner } from 'typeorm';

/** Formato en reposo: iv_hex:authTag_hex:ciphertext_hex (AES-256-GCM). */
const ENCRYPTED_PARTS = 3;
const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 500;

/**
 * SHA-256 hex (64 chars) del número de documento en texto plano.
 * Misma semántica que `apps/api` `hashDocumentNumber` y subscribers (migración 014).
 */
export function hashDocumentNumber(documentNumber: string): string {
  return crypto.createHash('sha256').update(documentNumber, 'utf8').digest('hex');
}

export function parseEncryptionKeyHex(keyHex: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/u.test(keyHex)) {
    throw new Error('Clave AES debe ser exactamente 64 caracteres hexadecimales.');
  }
  return Buffer.from(keyHex, 'hex');
}

/**
 * Carga claves desde env (mismo contrato que aes-gcm.util de la API).
 * No loguea el valor de la clave.
 */
export function loadAesGcmKeysFromEnv(env: NodeJS.ProcessEnv = process.env): {
  activeKey: Buffer;
  previousKey: Buffer | null;
} {
  const activeHex = env.MFA_ENCRYPTION_KEY;
  if (!activeHex || typeof activeHex !== 'string') {
    throw new Error(
      'MFA_ENCRYPTION_KEY es requerida para backfill de document_number_hash (migración 088).',
    );
  }

  const previousHex = env.MFA_ENCRYPTION_KEY_PREVIOUS;
  const previousKey =
    typeof previousHex === 'string' && previousHex.length > 0
      ? parseEncryptionKeyHex(previousHex)
      : null;

  return {
    activeKey: parseEncryptionKeyHex(activeHex),
    previousKey,
  };
}

/** Cifra con AES-256-GCM. Formato: iv:tag:ciphertext (hex). Solo para tests/helpers. */
export function encryptAes256Gcm(plaintext: string, activeKey: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', activeKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptWithKey(encrypted: string, key: Buffer): string {
  const parts = encrypted.split(':');
  if (parts.length !== ENCRYPTED_PARTS) {
    throw new Error('Formato de valor cifrado invalido. Se esperaba iv:authTag:ciphertext.');
  }

  const iv = Buffer.from(parts[0]!, 'hex');
  const authTag = Buffer.from(parts[1]!, 'hex');
  const ciphertext = Buffer.from(parts[2]!, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/**
 * Descifra con clave activa; si falla la auth tag GCM y hay previous, reintenta.
 * Misma semántica que `decryptAes256Gcm` de la API.
 */
export function decryptAes256Gcm(
  encrypted: string,
  activeKey: Buffer,
  previousKey?: Buffer | null,
): string {
  try {
    return decryptWithKey(encrypted, activeKey);
  } catch (activeError) {
    if (!previousKey) {
      throw activeError;
    }

    try {
      return decryptWithKey(encrypted, previousKey);
    } catch {
      throw activeError;
    }
  }
}

export type BackfillDocumentNumberHashResult = {
  processed: number;
  updated: number;
  skipped: number;
};

export type BackfillDocumentNumberHashOptions = {
  batchSize?: number;
  activeKey?: Buffer;
  previousKey?: Buffer | null;
  /** Logger opcional: solo conteos / ids; nunca plaintext ni ciphertext. */
  warn?: (message: string) => void;
};

type PendingRow = {
  id: string;
  document_number_encrypted: string;
};

/**
 * Backfill idempotente de `document_number_hash` por lotes keyset.
 * Solo filas con hash NULL y ciphertext presente. Cero PII en logs.
 */
export async function backfillExpedienteDocumentNumberHashes(
  queryRunner: QueryRunner,
  options: BackfillDocumentNumberHashOptions = {},
): Promise<BackfillDocumentNumberHashResult> {
  // Carga perezosa (R-6): un schema/tenant sin filas pendientes no debe exigir
  // MFA_ENCRYPTION_KEY. Solo se carga desde env cuando el primer lote no vacío
  // confirma que hay trabajo real, y una única vez para toda la corrida.
  let keys: { activeKey: Buffer; previousKey: Buffer | null } | null =
    options.activeKey !== undefined
      ? { activeKey: options.activeKey, previousKey: options.previousKey ?? null }
      : null;

  const safeBatch = Math.min(
    Math.max(Math.floor(options.batchSize ?? DEFAULT_BATCH_SIZE) || DEFAULT_BATCH_SIZE, 1),
    MAX_BATCH_SIZE,
  );
  const warn = options.warn ?? (() => undefined);

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let afterId: string | null = null;

  for (;;) {
    const params: unknown[] = [safeBatch];
    let sql = `
      SELECT id, document_number_encrypted
      FROM expediente_records
      WHERE document_number_hash IS NULL
        AND document_number_encrypted IS NOT NULL
    `;
    if (afterId) {
      params.unshift(afterId);
      sql += ` AND id > $1`;
      sql += ` ORDER BY id ASC LIMIT $2`;
    } else {
      sql += ` ORDER BY id ASC LIMIT $1`;
    }

    const batch = (await queryRunner.query(sql, params)) as PendingRow[];

    if (batch.length === 0) {
      break;
    }

    if (!keys) {
      keys = loadAesGcmKeysFromEnv();
    }

    afterId = batch[batch.length - 1]!.id;

    for (const row of batch) {
      processed += 1;
      const ciphertext = row.document_number_encrypted;
      if (!ciphertext) {
        skipped += 1;
        continue;
      }

      try {
        const plaintext = decryptAes256Gcm(ciphertext, keys.activeKey, keys.previousKey);
        const hash = hashDocumentNumber(plaintext);
        await queryRunner.query(
          `
            UPDATE expediente_records
            SET document_number_hash = $1
            WHERE id = $2
              AND document_number_hash IS NULL
          `,
          [hash, row.id],
        );
        updated += 1;
      } catch {
        skipped += 1;
        // Solo id: sin plaintext ni ciphertext (Ley 1581 / gate R-3).
        warn(`No se pudo backfillear document_number_hash para expediente ${row.id}`);
      }
    }

    if (batch.length < safeBatch) {
      break;
    }
  }

  // R-7: si hubo filas pendientes pero ninguna se pudo descifrar, no es un
  // resultado "vacío" válido — casi seguro la clave configurada no es la que
  // cifró los datos. No se captura: debe propagar para que la migración 088
  // falle y TypeORM NO la marque como aplicada (evita romper la búsqueda por
  // documento en silencio).
  if (processed > 0 && updated === 0) {
    throw new Error(
      `Backfill document_number_hash no actualizó ninguna fila ` +
        `(processed=${processed}, updated=${updated}, skipped=${skipped}). ` +
        'Causa probable: clave de cifrado incorrecta o ciphertext(s) ' +
        'corrupto(s)/no descifrable(s). Revisar MFA_ENCRYPTION_KEY ' +
        '(y PREVIOUS si aplica) o sanear las filas afectadas; no relajar este guardián.',
    );
  }

  return { processed, updated, skipped };
}
