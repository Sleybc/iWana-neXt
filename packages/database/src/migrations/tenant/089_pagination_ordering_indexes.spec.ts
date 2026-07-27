import type { QueryRunner } from 'typeorm';
import {
  dropInvalidIndexIfExists,
  PAGINATION_INDEX_NAMES,
  PaginationOrderingIndexes0890000000000,
  verifyPaginationIndexes,
} from './089_pagination_ordering_indexes';

function mockQueryRunner(responses: Array<{ sql: string; result: any }>): QueryRunner {
  let callIndex = 0;
  const query = jest.fn(async (sql: string, params?: unknown[]) => {
    const expected = responses[callIndex];
    if (!expected) {
      throw new Error(`Query no esperada (call #${callIndex}): ${sql.substring(0, 100)}`);
    }
    callIndex++;
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    const expectedNorm = expected.sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (!normalized.startsWith(expectedNorm)) {
      throw new Error(
        `Query #${callIndex - 1} inesperada.\n  esperado: ${expected.sql}\n  recibido: ${sql.substring(0, 150)}`,
      );
    }
    if (params !== undefined) {
      expect(params).toEqual(expectedResultForSql(expectedNorm, callIndex - 1));
    }
    return expected.result;
  });
  return { query } as unknown as QueryRunner;
}

// Stub para validación de bind params en tests que no mockean esa capa.
function expectedResultForSql(_sql: string, _callIndex: number): unknown[] {
  return expect.any(Array);
}

describe('089 pagination ordering indexes', () => {
  const migration = new PaginationOrderingIndexes0890000000000();

  describe('dropInvalidIndexIfExists (fix: sin dollar-quoting)', () => {
    it('no ejecuta DROP si el índice no existe en pg_index', async () => {
      const qr = mockQueryRunner([{ sql: 'SELECT 1 FROM pg_index', result: [] }]);

      await dropInvalidIndexIfExists(qr, 'idx_pag_inventory_items_created_id');

      // La única query ejecutada debió ser el SELECT, no el DROP.
      expect(qr.query).toHaveBeenCalledTimes(1);
    });

    it('no ejecuta DROP si el índice existe pero es válido (indisvalid=true)', async () => {
      const qr = mockQueryRunner([{ sql: 'SELECT 1 FROM pg_index', result: [] }]);

      await dropInvalidIndexIfExists(qr, 'idx_pag_stock_balances_updated_id');

      expect(qr.query).toHaveBeenCalledTimes(1);
    });

    it('ejecuta DROP CONCURRENTLY cuando el índice es INVALID y está en la whitelist', async () => {
      const qr = mockQueryRunner([
        { sql: 'SELECT 1 FROM pg_index', result: [{ '?column?': 1 }] },
        {
          sql: 'DROP INDEX CONCURRENTLY IF EXISTS "idx_pag_inventory_items_created_id"',
          result: [],
        },
      ]);

      const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});

      await dropInvalidIndexIfExists(qr, 'idx_pag_inventory_items_created_id');

      expect(qr.query).toHaveBeenCalledTimes(2);
      expect(consoleLog).toHaveBeenCalledWith(
        '[089] cleaned up invalid index: idx_pag_inventory_items_created_id',
      );

      consoleLog.mockRestore();
    });

    it('lanza si el nombre no está en PAGINATION_INDEX_NAMES (defensa whitelist)', async () => {
      const qr = mockQueryRunner([{ sql: 'SELECT 1 FROM pg_index', result: [{ '?column?': 1 }] }]);

      await expect(
        dropInvalidIndexIfExists(qr, 'idx_pag_evil_injected; DROP TABLE users;--'),
      ).rejects.toThrow(
        '[089] index name not in whitelist: idx_pag_evil_injected; DROP TABLE users;--',
      );
      expect(qr.query).toHaveBeenCalledTimes(1); // Solo el SELECT, no el DROP.
    });

    it('el SELECT usa bind parameter $1 (no interpola el nombre en SQL)', async () => {
      const query = jest.fn(async (sql: string, params?: unknown[]) => {
        // Verificar que $1 aparece literal en el SQL y que params tiene el nombre.
        expect(sql).toContain('$1');
        expect(params).toEqual(['idx_pag_audit_logs_created_id']);
        return [];
      });
      const qr = { query } as unknown as QueryRunner;

      await dropInvalidIndexIfExists(qr, 'idx_pag_audit_logs_created_id');
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('filtra por current_schema() via pg_namespace (D-1)', async () => {
      const query = jest.fn(async (sql: string) => {
        expect(sql).toContain('pg_namespace');
        expect(sql).toContain('current_schema()');
        return [];
      });
      const qr = { query } as unknown as QueryRunner;

      await dropInvalidIndexIfExists(qr, 'idx_pag_audit_logs_created_id');
      expect(query).toHaveBeenCalledTimes(1);
    });
  });

  describe('verifyPaginationIndexes', () => {
    it('retorna valid=17, invalid=[], missing=[] cuando todos están OK', async () => {
      const rows = PAGINATION_INDEX_NAMES.map((name) => ({
        index_name: name,
        is_valid: true,
        index_def: `CREATE INDEX ${name} ON t (col)`,
      }));
      const qr = mockQueryRunner([{ sql: 'SELECT c.relname AS index_name', result: rows }]);

      const result = await verifyPaginationIndexes(qr);

      expect(result.valid).toHaveLength(17);
      expect(result.invalid).toHaveLength(0);
      expect(result.missing).toHaveLength(0);
    });

    it('detecta índices INVALID', async () => {
      const rows = PAGINATION_INDEX_NAMES.map((name) => ({
        index_name: name,
        is_valid: name === 'idx_pag_audit_logs_created_id' ? false : true,
        index_def: `CREATE INDEX ${name} ON t (col)`,
      }));
      const qr = mockQueryRunner([{ sql: 'SELECT c.relname AS index_name', result: rows }]);

      const result = await verifyPaginationIndexes(qr);

      expect(result.invalid).toEqual(['idx_pag_audit_logs_created_id']);
      expect(result.valid).toHaveLength(16);
      expect(result.missing).toHaveLength(0);
    });

    it('detecta índices MISSING (no retornados por pg_index)', async () => {
      // Solo retornamos 15 de los 17 índices.
      const rows = PAGINATION_INDEX_NAMES.slice(0, 15).map((name) => ({
        index_name: name,
        is_valid: true,
        index_def: `CREATE INDEX ${name} ON t (col)`,
      }));
      const qr = mockQueryRunner([{ sql: 'SELECT c.relname AS index_name', result: rows }]);

      const result = await verifyPaginationIndexes(qr);

      expect(result.valid).toHaveLength(15);
      expect(result.invalid).toHaveLength(0);
      expect(result.missing).toEqual(PAGINATION_INDEX_NAMES.slice(15));
      expect(result.missing).toHaveLength(2);
    });

    it('retorna valid=[], missing=17 cuando la tabla pg_index está vacía', async () => {
      const qr = mockQueryRunner([{ sql: 'SELECT c.relname AS index_name', result: [] }]);

      const result = await verifyPaginationIndexes(qr);

      expect(result.valid).toHaveLength(0);
      expect(result.invalid).toHaveLength(0);
      expect(result.missing).toHaveLength(17);
    });

    it('filtra por current_schema() via pg_namespace (D-1)', async () => {
      // Sin el filtro, indices de otros schemas contaminarian el conteo.
      // Con el filtro, solo cuentan los del schema activo.
      const query = jest.fn(async (sql: string) => {
        expect(sql).toContain('pg_namespace');
        expect(sql).toContain('current_schema()');
        return PAGINATION_INDEX_NAMES.map((name) => ({
          index_name: name,
          is_valid: true,
          index_def: `CREATE INDEX ${name} ON t (col)`,
        }));
      });
      const qr = { query } as unknown as QueryRunner;

      const result = await verifyPaginationIndexes(qr);
      expect(result.valid).toHaveLength(17);
      expect(result.invalid).toHaveLength(0);
      expect(result.missing).toHaveLength(0);
    });
  });

  describe('up() smoke', () => {
    it('ejecuta la secuencia de 17 × (drop-invalid + create) + verify sin errores', async () => {
      const queryCalls: string[] = [];

      const query = jest.fn(async (sql: string, _params?: unknown[]) => {
        const trimmed = sql.replace(/\s+/g, ' ').trim();
        queryCalls.push(trimmed);
        const normalized = trimmed.toLowerCase();

        // dropInvalidIndexIfExists SELECT: sin filas → no hay índice inválido.
        if (normalized.includes('from pg_index') && normalized.includes('indisvalid = false')) {
          return [];
        }

        // CREATE INDEX CONCURRENTLY: ok.
        if (normalized.startsWith('create index concurrently')) return [];

        // verifyPaginationIndexes SELECT: todos válidos.
        if (normalized.includes('c.relname as index_name')) {
          return PAGINATION_INDEX_NAMES.map((name) => ({
            index_name: name,
            is_valid: true,
            index_def: `CREATE INDEX ${name} ON t (col)`,
          }));
        }

        return [];
      });
      const qr = { query } as unknown as QueryRunner;
      const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});

      await migration.up(qr);

      // 17 drop-invalid SELECT + 17 CREATE + 1 verify SELECT = 35 queries.
      const lowerCalls = queryCalls.map((c) => c.toLowerCase());
      const dropChecks = lowerCalls.filter(
        (c) => c.includes('pg_index') && c.includes('indisvalid = false'),
      );
      const creates = lowerCalls.filter((c) => c.startsWith('create index concurrently'));
      const verifySelects = lowerCalls.filter((c) => c.includes('c.relname as index_name'));

      expect(dropChecks).toHaveLength(17);
      expect(creates).toHaveLength(17);
      expect(verifySelects).toHaveLength(1);
      expect(query).toHaveBeenCalledTimes(35);

      // Sin warnings porque todos los índices están OK.
      expect(consoleWarn).not.toHaveBeenCalled();
      expect(consoleLog).toHaveBeenCalledWith('[089] All 17 pagination indexes verified valid.');

      consoleWarn.mockRestore();
      consoleLog.mockRestore();
    });

    it('advierte cuando algún índice queda INVALID o MISSING', async () => {
      // Precondición: los SELECT de dropInvalidIndexIfExists no encuentran
      // índices inválidos (todos se crean limpiamente en este escenario).
      const query = jest.fn(async (sql: string) => {
        const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
        // drop-check SELECT (pg_index + indisvalid = false): sin filas.
        if (normalized.includes('from pg_index') && normalized.includes('indisvalid = false')) {
          return [];
        }
        // CREATE INDEX CONCURRENTLY: ok.
        if (normalized.startsWith('create index concurrently')) return [];
        // verifyPaginationIndexes SELECT: 15 encontrados, 1 INVALID, 2 missing.
        if (normalized.includes('c.relname as index_name')) {
          const rows = PAGINATION_INDEX_NAMES.slice(0, 15).map((name) => ({
            index_name: name,
            is_valid: name === 'idx_pag_visit_requests_created_id' ? false : true,
            index_def: `CREATE INDEX ${name} ON t (col)`,
          }));
          return rows;
        }
        return [];
      });
      const qr = { query } as unknown as QueryRunner;
      const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});

      await migration.up(qr);

      expect(consoleWarn).toHaveBeenCalledTimes(2); // invalid + missing
      expect(consoleLog).not.toHaveBeenCalled();

      consoleWarn.mockRestore();
      consoleLog.mockRestore();
    });
  });

  describe('down() smoke', () => {
    it('ejecuta DROP INDEX CONCURRENTLY para cada uno de los 17 índices', async () => {
      const dropped: string[] = [];
      const query = jest.fn(async (sql: string) => {
        dropped.push(sql.replace(/\s+/g, ' ').trim());
        return [];
      });
      const qr = { query } as unknown as QueryRunner;

      await migration.down(qr);

      expect(query).toHaveBeenCalledTimes(17);
      for (const name of PAGINATION_INDEX_NAMES) {
        expect(dropped.some((d) => d.includes(name))).toBe(true);
      }
    });
  });
});
