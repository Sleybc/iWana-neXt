import type { QueryRunner } from 'typeorm';
import {
  backfillExpedienteDocumentNumberHashes,
  decryptAes256Gcm,
  encryptAes256Gcm,
  hashDocumentNumber,
  parseEncryptionKeyHex,
} from './backfill-expediente-document-number-hash.util';

/** Clave de prueba con entropía no nula (no es secreto real). */
const ACTIVE_HEX = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const PII_HASH_HEX = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';

/**
 * R-9 — vector de frontera como dato (no import cruzado).
 * Ciphertext generado una vez con apps/api `encryptAes256Gcm` (AES-256-GCM,
 * iv:tag:ciphertext hex) bajo ACTIVE_HEX; embebido literal aquí y en el spec
 * de la API. Cada lado descifra con su propia util al mismo plaintext.
 */
const R9_PLAINTEXT = '900123456';
const R9_CIPHERTEXT_LITERAL =
  'd55c0fcd467d2a23bfb48839:d3e049c6d77ae2d4357a83ce94d28e8f:27e5a87c5c2fbfb966';

describe('088 backfill expediente document_number_hash (helper)', () => {
  const activeKey = parseEncryptionKeyHex(ACTIVE_HEX);
  const hashKey = Buffer.from(PII_HASH_HEX, 'hex');
  const plaintext = '900123456';
  const expectedHash = hashDocumentNumber(plaintext, hashKey);
  const previousPii = process.env.PII_HASH_KEY;

  beforeAll(() => {
    process.env.PII_HASH_KEY = PII_HASH_HEX;
  });

  afterAll(() => {
    if (previousPii === undefined) {
      delete process.env.PII_HASH_KEY;
    } else {
      process.env.PII_HASH_KEY = previousPii;
    }
  });

  describe('R-9: vector ciphertext literal (frontera formato)', () => {
    it('descifra el literal embebido al plaintext esperado con el helper de migración', () => {
      expect(decryptAes256Gcm(R9_CIPHERTEXT_LITERAL, activeKey, null)).toBe(R9_PLAINTEXT);
    });
  });

  it('rellena hash NULL desde ciphertext y permite listar por documento vía hash', async () => {
    const ciphertext = encryptAes256Gcm(plaintext, activeKey);
    const rowId = '11111111-1111-4111-8111-111111111111';

    const store = new Map<
      string,
      { id: string; document_number_encrypted: string; document_number_hash: string | null }
    >([
      [
        rowId,
        {
          id: rowId,
          document_number_encrypted: ciphertext,
          document_number_hash: null,
        },
      ],
    ]);

    const warn = jest.fn();
    const queryRunner = {
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();

        if (normalized.startsWith('select id, document_number_encrypted')) {
          const limit = Number(params[params.length - 1]);
          const afterId = params.length === 2 ? String(params[0]) : null;
          const pending = [...store.values()]
            .filter(
              (row) => row.document_number_hash === null && row.document_number_encrypted != null,
            )
            .filter((row) => (afterId ? row.id > afterId : true))
            .sort((a, b) => a.id.localeCompare(b.id))
            .slice(0, limit)
            .map(({ id, document_number_encrypted }) => ({ id, document_number_encrypted }));
          return pending;
        }

        if (normalized.startsWith('update expediente_records')) {
          const [hash, id] = params as [string, string];
          const row = store.get(id);
          if (row && row.document_number_hash === null) {
            row.document_number_hash = hash;
          }
          return [];
        }

        throw new Error(`SQL no esperado en stub: ${sql}`);
      }),
    } as unknown as QueryRunner;

    const result = await backfillExpedienteDocumentNumberHashes(queryRunner, {
      activeKey,
      previousKey: null,
      batchSize: 50,
      warn,
    });

    expect(result).toEqual({ processed: 1, updated: 1, skipped: 0 });
    expect(store.get(rowId)?.document_number_hash).toBe(expectedHash);
    expect(warn).not.toHaveBeenCalled();

    // Semántica de findAll por documentNumber: igualdad de hash (sin reopen decrypt).
    const listByDocument = [...store.values()].filter(
      (row) => row.document_number_hash === hashDocumentNumber(plaintext, hashKey),
    );
    expect(listByDocument).toHaveLength(1);
    expect(listByDocument[0]?.id).toBe(rowId);

    for (const call of warn.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(plaintext);
      expect(JSON.stringify(call)).not.toContain(ciphertext);
    }
  });

  it('es idempotente: segunda pasada no reprocesa filas ya hasheadas', async () => {
    let selectCalls = 0;

    const queryRunner = {
      query: jest.fn(async (sql: string) => {
        const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
        if (normalized.startsWith('select id, document_number_encrypted')) {
          selectCalls += 1;
          // Sin pendientes (hash ya presente o vacío).
          return [];
        }
        if (normalized.startsWith('update')) {
          throw new Error('No debe UPDATE en pasada idempotente vacía');
        }
        return [];
      }),
    } as unknown as QueryRunner;

    const result = await backfillExpedienteDocumentNumberHashes(queryRunner, {
      activeKey,
      batchSize: 10,
    });

    expect(result).toEqual({ processed: 0, updated: 0, skipped: 0 });
    expect(selectCalls).toBe(1);
  });

  it('hashDocumentNumber coincide con semántica SHA-256 hex de 64 chars', () => {
    expect(expectedHash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashDocumentNumber(plaintext)).toBe(expectedHash);
  });

  describe('R-6: carga perezosa de MFA_ENCRYPTION_KEY', () => {
    const originalEnv = process.env.MFA_ENCRYPTION_KEY;

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.MFA_ENCRYPTION_KEY;
      } else {
        process.env.MFA_ENCRYPTION_KEY = originalEnv;
      }
    });

    it('schema sin filas pendientes no exige MFA_ENCRYPTION_KEY en el entorno', async () => {
      delete process.env.MFA_ENCRYPTION_KEY;

      const queryRunner = {
        query: jest.fn(async (sql: string) => {
          const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
          if (normalized.startsWith('select id, document_number_encrypted')) {
            // Primer lote ya viene vacío: no hay trabajo real que hacer.
            return [];
          }
          throw new Error(`SQL no esperado en stub: ${sql}`);
        }),
      } as unknown as QueryRunner;

      // Sin options.activeKey: si la función cargara llaves de forma
      // incondicional, esto lanzaría por falta de MFA_ENCRYPTION_KEY.
      const result = await backfillExpedienteDocumentNumberHashes(queryRunner, {
        batchSize: 10,
      });

      expect(result).toEqual({ processed: 0, updated: 0, skipped: 0 });
      expect(process.env.MFA_ENCRYPTION_KEY).toBeUndefined();
    });
  });

  describe('R-7/R-12: clave incorrecta o ciphertext no descifrable', () => {
    it('lanza en vez de retornar updated=0 silenciosamente y cita ambas causas', async () => {
      // Cifrada con una clave distinta a la que se pasará a la función:
      // simula MFA_ENCRYPTION_KEY mal configurada en el entorno destino.
      const wrongKeyHex = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
      const wrongKey = parseEncryptionKeyHex(wrongKeyHex);
      const ciphertext = encryptAes256Gcm(plaintext, wrongKey);
      const rowId = '22222222-2222-4222-8222-222222222222';

      const store = new Map([
        [
          rowId,
          {
            id: rowId,
            document_number_encrypted: ciphertext,
            document_number_hash: null as string | null,
          },
        ],
      ]);

      const warn = jest.fn();
      const queryRunner = {
        query: jest.fn(async (sql: string, params: unknown[] = []) => {
          const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();

          if (normalized.startsWith('select id, document_number_encrypted')) {
            const limit = Number(params[params.length - 1]);
            const afterId = params.length === 2 ? String(params[0]) : null;
            const pending = [...store.values()]
              .filter(
                (row) => row.document_number_hash === null && row.document_number_encrypted != null,
              )
              .filter((row) => (afterId ? row.id > afterId : true))
              .sort((a, b) => a.id.localeCompare(b.id))
              .slice(0, limit)
              .map(({ id, document_number_encrypted }) => ({ id, document_number_encrypted }));
            return pending;
          }

          if (normalized.startsWith('update expediente_records')) {
            throw new Error('No debe UPDATE si el descifrado falló');
          }

          throw new Error(`SQL no esperado en stub: ${sql}`);
        }),
      } as unknown as QueryRunner;

      await expect(
        backfillExpedienteDocumentNumberHashes(queryRunner, {
          activeKey, // clave "activa" real, distinta de wrongKey usada al cifrar
          previousKey: null,
          batchSize: 50,
          warn,
        }),
      ).rejects.toThrow(
        /processed=1.*updated=0.*skipped=1.*clave de cifrado incorrecta.*ciphertext/s,
      );

      // Cero PII: el mensaje de error no debe traer plaintext ni ciphertext.
      for (const call of warn.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(plaintext);
        expect(JSON.stringify(call)).not.toContain(ciphertext);
      }
    });
  });
});
