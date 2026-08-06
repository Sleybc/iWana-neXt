import type { QueryRunner } from 'typeorm';
import {
  encryptAes256Gcm,
  parseEncryptionKeyHex,
} from './backfill-expediente-document-number-hash.util';
import {
  backfillPlatformUsersEmailHmac,
  backfillSubscriberHmacColumns,
  backfillUsersEmailHmac,
} from './backfill-pii-hmac.util';
import { hmacDocumentNumber, hmacEmail, hmacPhone } from './pii-hmac.util';

/** Claves de prueba con entropía no nula (no son secretos reales). */
const ACTIVE_HEX = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const OTHER_HEX = '89abcdef0123456789abcdef0123456789abcdef0123456789abcdef01234567';
const PII_HASH_HEX = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';

const activeKey = parseEncryptionKeyHex(ACTIVE_HEX);
const otherKey = parseEncryptionKeyHex(OTHER_HEX);
const hashKey = Buffer.from(PII_HASH_HEX, 'hex');

interface SubscriberRow {
  id: string;
  document_number_encrypted: string | null;
  email_encrypted: string | null;
  phone_encrypted: string | null;
  document_number_hmac: string | null;
  email_hmac: string | null;
  phone_hmac: string | null;
}

/** QueryRunner mínimo sobre un Map, con la semántica keyset del backfill. */
function subscriberQueryRunner(store: Map<string, SubscriberRow>): QueryRunner {
  return {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      if (normalized.startsWith('select id,')) {
        const limit = Number(params[params.length - 1]);
        const afterId = params.length === 2 ? String(params[0]) : null;

        return [...store.values()]
          .filter(
            (row) =>
              (row.document_number_hmac === null && row.document_number_encrypted !== null) ||
              (row.email_hmac === null && row.email_encrypted !== null) ||
              (row.phone_hmac === null && row.phone_encrypted !== null),
          )
          .filter((row) => (afterId ? row.id > afterId : true))
          .sort((a, b) => a.id.localeCompare(b.id))
          .slice(0, limit)
          .map((row) => ({ ...row }));
      }

      if (normalized.startsWith('update subscribers')) {
        const [digest, id] = params as [string, string];
        const column = (['document_number_hmac', 'email_hmac', 'phone_hmac'] as const).find(
          (candidate) => normalized.includes(`set ${candidate} =`),
        );
        if (!column) {
          throw new Error(`No se identificó la columna en: ${sql}`);
        }
        const row = store.get(id);
        if (row && row[column] === null) {
          row[column] = digest;
        }
        return [];
      }

      throw new Error(`SQL no esperado en stub: ${sql}`);
    }),
  } as unknown as QueryRunner;
}

function subscriber(id: string, overrides: Partial<SubscriberRow> = {}): SubscriberRow {
  return {
    id,
    document_number_encrypted: null,
    email_encrypted: null,
    phone_encrypted: null,
    document_number_hmac: null,
    email_hmac: null,
    phone_hmac: null,
    ...overrides,
  };
}

describe('backfillSubscriberHmacColumns', () => {
  const documentNumber = '900123456';
  const email = 'Ana.Perez@Example.CO';
  const phone = '+573001234567';

  it('deriva los tres HMAC desde el ciphertext con la misma semántica que el runtime', async () => {
    const row = subscriber('11111111-1111-4111-8111-111111111111', {
      document_number_encrypted: encryptAes256Gcm(documentNumber, activeKey),
      email_encrypted: encryptAes256Gcm(email, activeKey),
      phone_encrypted: encryptAes256Gcm(phone, activeKey),
    });
    const store = new Map([[row.id, row]]);
    const warn = jest.fn();

    const result = await backfillSubscriberHmacColumns(subscriberQueryRunner(store), {
      activeKey,
      previousKey: null,
      hashKey,
      warn,
    });

    expect(result).toEqual({ processed: 1, updated: 1, skipped: 0, failed: 0 });
    expect(store.get(row.id)?.document_number_hmac).toBe(
      hmacDocumentNumber(documentNumber, hashKey),
    );
    // El email se normaliza (lowercase + trim) igual que hashEmail en apps/api:
    // si el backfill no normalizara, el runtime no encontraría al suscriptor.
    expect(store.get(row.id)?.email_hmac).toBe(hmacEmail(email, hashKey));
    expect(store.get(row.id)?.email_hmac).toBe(hmacEmail('  ana.perez@example.co  ', hashKey));
    expect(store.get(row.id)?.phone_hmac).toBe(hmacPhone(phone, hashKey));
    expect(warn).not.toHaveBeenCalled();
  });

  it('lanza en vez de terminar en silencio cuando ninguna fila se pudo derivar', async () => {
    // Ciphertext escrito con una clave que ya no está configurada: el escenario
    // que dejaba subscribers sin HMAC y hacía que la 109 borrara sus SHA-256.
    const row = subscriber('22222222-2222-4222-8222-222222222222', {
      document_number_encrypted: encryptAes256Gcm(documentNumber, otherKey),
      email_encrypted: encryptAes256Gcm(email, otherKey),
    });
    const store = new Map([[row.id, row]]);
    const warn = jest.fn();

    await expect(
      backfillSubscriberHmacColumns(subscriberQueryRunner(store), {
        activeKey,
        previousKey: null,
        hashKey,
        warn,
      }),
    ).rejects.toThrow(/processed=1.*updated=0.*failed=2.*MFA_ENCRYPTION_KEY/s);

    expect(store.get(row.id)?.document_number_hmac).toBeNull();
  });

  it('contabiliza en failed el campo que falla dentro de una fila por lo demás actualizada', async () => {
    // Sin el contador `failed`, esta fila contaba como `updated` y la pérdida
    // parcial no aparecía en ningún lado del resumen de la migración.
    const row = subscriber('33333333-3333-4333-8333-333333333333', {
      document_number_encrypted: encryptAes256Gcm(documentNumber, activeKey),
      email_encrypted: encryptAes256Gcm(email, otherKey),
    });
    const store = new Map([[row.id, row]]);
    const warn = jest.fn();

    const result = await backfillSubscriberHmacColumns(subscriberQueryRunner(store), {
      activeKey,
      previousKey: null,
      hashKey,
      warn,
    });

    expect(result).toEqual({ processed: 1, updated: 1, skipped: 0, failed: 1 });
    expect(store.get(row.id)?.document_number_hmac).not.toBeNull();
    expect(store.get(row.id)?.email_hmac).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('descifra con la clave previa cuando hubo rotación', async () => {
    const row = subscriber('44444444-4444-4444-8444-444444444444', {
      phone_encrypted: encryptAes256Gcm(phone, otherKey),
    });
    const store = new Map([[row.id, row]]);

    const result = await backfillSubscriberHmacColumns(subscriberQueryRunner(store), {
      activeKey,
      previousKey: otherKey,
      hashKey,
    });

    expect(result.failed).toBe(0);
    expect(store.get(row.id)?.phone_hmac).toBe(hmacPhone(phone, hashKey));
  });

  it('no emite PII en los avisos: solo identificadores', async () => {
    const row = subscriber('55555555-5555-4555-8555-555555555555', {
      document_number_encrypted: encryptAes256Gcm(documentNumber, activeKey),
      email_encrypted: encryptAes256Gcm(email, otherKey),
    });
    const store = new Map([[row.id, row]]);
    const warn = jest.fn();

    await backfillSubscriberHmacColumns(subscriberQueryRunner(store), {
      activeKey,
      previousKey: null,
      hashKey,
      warn,
    });

    const emitted = JSON.stringify(warn.mock.calls);
    expect(emitted).not.toContain(documentNumber);
    expect(emitted).not.toContain(email);
    expect(emitted).not.toContain(phone);
    expect(emitted).not.toContain(PII_HASH_HEX);
    expect(emitted).toContain(row.id);
  });

  it('avanza el cursor keyset aunque una fila quede sin actualizar (no hay bucle infinito)', async () => {
    // Fila 1 indescifrable, fila 2 correcta: si el cursor no avanzara con las
    // filas saltadas, el SELECT devolvería siempre el mismo lote.
    const failing = subscriber('66666666-6666-4666-8666-666666666666', {
      email_encrypted: encryptAes256Gcm(email, otherKey),
    });
    const ok = subscriber('77777777-7777-4777-8777-777777777777', {
      email_encrypted: encryptAes256Gcm(email, activeKey),
    });
    const store = new Map([
      [failing.id, failing],
      [ok.id, ok],
    ]);

    const result = await backfillSubscriberHmacColumns(subscriberQueryRunner(store), {
      activeKey,
      previousKey: null,
      hashKey,
      batchSize: 1,
    });

    expect(result).toEqual({ processed: 2, updated: 1, skipped: 1, failed: 1 });
    expect(store.get(ok.id)?.email_hmac).toBe(hmacEmail(email, hashKey));
  });

  it('es idempotente: una segunda pasada no reprocesa filas ya derivadas', async () => {
    const row = subscriber('88888888-8888-4888-8888-888888888888', {
      email_encrypted: encryptAes256Gcm(email, activeKey),
    });
    const store = new Map([[row.id, row]]);
    const options = { activeKey, previousKey: null, hashKey };

    await backfillSubscriberHmacColumns(subscriberQueryRunner(store), options);
    const second = await backfillSubscriberHmacColumns(subscriberQueryRunner(store), options);

    expect(second).toEqual({ processed: 0, updated: 0, skipped: 0, failed: 0 });
  });
});

describe('backfillUsersEmailHmac', () => {
  it('normaliza el email igual que el runtime y reporta failed', async () => {
    const rows = [
      { id: 'a0000000-0000-4000-8000-000000000001', email: '  Admin@Example.CO ' },
      { id: 'a0000000-0000-4000-8000-000000000002', email: 'otro@example.co' },
    ];
    const written = new Map<string, string>();

    const queryRunner = {
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
        if (normalized.startsWith('select id, email')) {
          const afterId = params.length === 2 ? String(params[0]) : null;
          return rows
            .filter((row) => !written.has(row.id))
            .filter((row) => (afterId ? row.id > afterId : true));
        }
        if (normalized.startsWith('update users')) {
          const [digest, id] = params as [string, string];
          written.set(id, digest);
          return [];
        }
        throw new Error(`SQL no esperado en stub: ${sql}`);
      }),
    } as unknown as QueryRunner;

    const result = await backfillUsersEmailHmac(queryRunner, { hashKey });

    expect(result).toEqual({ processed: 2, updated: 2, skipped: 0, failed: 0 });
    expect(written.get(rows[0]!.id)).toBe(hmacEmail('admin@example.co', hashKey));
  });
});

describe('backfillPlatformUsersEmailHmac', () => {
  it('descifra el email antes de derivar el HMAC', async () => {
    const email = 'Support@Iwana.CO';
    const row = {
      id: 'b0000000-0000-4000-8000-000000000001',
      email: encryptAes256Gcm(email, activeKey),
    };
    const written = new Map<string, string>();

    const queryRunner = {
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
        if (normalized.startsWith('select id, email')) {
          return written.has(row.id) ? [] : [row];
        }
        if (normalized.startsWith('update public.platform_users')) {
          const [digest, id] = params as [string, string];
          written.set(id, digest);
          return [];
        }
        throw new Error(`SQL no esperado en stub: ${sql}`);
      }),
    } as unknown as QueryRunner;

    const result = await backfillPlatformUsersEmailHmac(queryRunner, {
      activeKey,
      previousKey: null,
      hashKey,
    });

    expect(result).toEqual({ processed: 1, updated: 1, skipped: 0, failed: 0 });
    expect(written.get(row.id)).toBe(hmacEmail(email, hashKey));
  });
});
