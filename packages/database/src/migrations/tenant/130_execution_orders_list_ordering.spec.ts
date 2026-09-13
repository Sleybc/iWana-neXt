import type { QueryRunner } from 'typeorm';
import {
  dropInvalidExecutionOrdersIndexIfExists,
  EXECUTION_ORDERS_LIST_INDEX_NAMES,
  ExecutionOrdersListOrdering1300000000000,
  verifyExecutionOrdersListIndexes,
} from './130_execution_orders_list_ordering';

/**
 * Crea un QueryRunner mock que responde una secuencia de queries esperadas.
 * Cada respuesta declara el prefijo SQL esperado (normalizado) y el resultado.
 */
function mockQueryRunner(responses: Array<{ sql: string; result: unknown }>): QueryRunner {
  let callIndex = 0;
  const query = jest.fn(async (sql: string) => {
    const expected = responses[callIndex];
    if (!expected) {
      throw new Error(`Query no esperada (call #${callIndex}): ${sql.substring(0, 120)}`);
    }
    callIndex += 1;
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    const expectedNorm = expected.sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (!normalized.startsWith(expectedNorm)) {
      throw new Error(
        `Query #${callIndex - 1} inesperada.\n  esperado: ${expected.sql}\n  recibido: ${sql.substring(0, 160)}`,
      );
    }
    return expected.result;
  });
  return { query } as unknown as QueryRunner;
}

describe('130 execution-orders list ordering indexes', () => {
  const migration = new ExecutionOrdersListOrdering1300000000000();

  it('corre fuera de transacción (ADR-066: CREATE INDEX CONCURRENTLY)', () => {
    expect(migration.transactional).toBe(false);
  });

  it('up crea los dos índices con CONCURRENTLY y verifica al final', async () => {
    const qr = mockQueryRunner([
      // Limpieza de inválidos: SELECT sin filas → sin DROP.
      { sql: 'SELECT 1 FROM pg_index', result: [] },
      {
        sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_execution_orders_tenant_window_start',
        result: [],
      },
      { sql: 'SELECT 1 FROM pg_index', result: [] },
      {
        sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_execution_orders_tenant_assigned_crew',
        result: [],
      },
      // Verificación post-migración: ambos válidos.
      {
        sql: 'SELECT c.relname AS index_name',
        result: [
          { index_name: 'idx_execution_orders_tenant_assigned_crew', is_valid: true },
          { index_name: 'idx_execution_orders_tenant_window_start', is_valid: true },
        ],
      },
    ]);

    const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await migration.up(qr);

    expect(qr.query).toHaveBeenCalledTimes(5);
    expect(consoleWarn).not.toHaveBeenCalled();
    expect(consoleLog).toHaveBeenCalledWith('[130] All 2 execution-orders indexes verified valid.');

    consoleLog.mockRestore();
    consoleWarn.mockRestore();
  });

  it('up cubre el orden por defecto (planned_window_start_at DESC, id DESC)', async () => {
    const seen: string[] = [];
    const qr = {
      query: jest.fn(async (sql: string) => {
        seen.push(sql.replace(/\s+/g, ' ').trim());
        if (sql.includes('SELECT c.relname')) {
          return [
            { index_name: 'idx_execution_orders_tenant_assigned_crew', is_valid: true },
            { index_name: 'idx_execution_orders_tenant_window_start', is_valid: true },
          ];
        }
        return [];
      }),
    } as unknown as QueryRunner;

    const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await migration.up(qr);

    const createWindow = seen.find((s) => s.includes('idx_execution_orders_tenant_window_start'));
    expect(createWindow).toContain('CONCURRENTLY');
    expect(createWindow).toContain('(tenant_id, planned_window_start_at DESC, id DESC)');

    consoleLog.mockRestore();
    consoleWarn.mockRestore();
  });

  it('down revierte con DROP CONCURRENTLY en orden inverso', async () => {
    const seen: string[] = [];
    const qr = {
      query: jest.fn(async (sql: string) => {
        seen.push(sql.replace(/\s+/g, ' ').trim());
        return [];
      }),
    } as unknown as QueryRunner;

    await migration.down(qr);

    expect(seen).toEqual([
      'DROP INDEX CONCURRENTLY IF EXISTS idx_execution_orders_tenant_assigned_crew',
      'DROP INDEX CONCURRENTLY IF EXISTS idx_execution_orders_tenant_window_start',
    ]);
  });

  it('no califica DDL con schema de tenant (search_path del runner)', async () => {
    const seen: string[] = [];
    const qr = {
      query: jest.fn(async (sql: string) => {
        seen.push(sql);
        if (sql.includes('SELECT c.relname')) {
          return [
            { index_name: 'idx_execution_orders_tenant_assigned_crew', is_valid: true },
            { index_name: 'idx_execution_orders_tenant_window_start', is_valid: true },
          ];
        }
        return [];
      }),
    } as unknown as QueryRunner;

    const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await migration.up(qr);

    const ddl = seen.filter((s) => s.includes('execution_orders'));
    expect(ddl.length).toBeGreaterThan(0);
    for (const statement of ddl) {
      expect(statement).not.toMatch(/tenant_[a-z0-9_]+ *\./);
    }

    consoleLog.mockRestore();
    consoleWarn.mockRestore();
  });

  it('dropInvalidExecutionOrdersIndexIfExists limpia solo índices INVALID en whitelist', async () => {
    const qr = mockQueryRunner([
      { sql: 'SELECT 1 FROM pg_index', result: [{ '?column?': 1 }] },
      {
        sql: 'DROP INDEX CONCURRENTLY IF EXISTS "idx_execution_orders_tenant_window_start"',
        result: [],
      },
    ]);

    const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});

    await dropInvalidExecutionOrdersIndexIfExists(qr, 'idx_execution_orders_tenant_window_start');

    expect(qr.query).toHaveBeenCalledTimes(2);
    expect(consoleLog).toHaveBeenCalledWith(
      '[130] cleaned up invalid index: idx_execution_orders_tenant_window_start',
    );

    consoleLog.mockRestore();
  });

  it('dropInvalidExecutionOrdersIndexIfExists rechaza nombres fuera de la whitelist', async () => {
    const qr = mockQueryRunner([{ sql: 'SELECT 1 FROM pg_index', result: [{ '?column?': 1 }] }]);

    await expect(
      dropInvalidExecutionOrdersIndexIfExists(qr, 'idx_execution_orders_tenant_status'),
    ).rejects.toThrow('[130] index name not in whitelist');
  });

  it('verifyExecutionOrdersListIndexes reporta inválidos y faltantes', async () => {
    const qr = {
      query: jest.fn(async () => [
        { index_name: 'idx_execution_orders_tenant_window_start', is_valid: false },
      ]),
    } as unknown as QueryRunner;

    const result = await verifyExecutionOrdersListIndexes(qr);

    expect(result.invalid).toEqual(['idx_execution_orders_tenant_window_start']);
    expect(result.missing).toEqual(['idx_execution_orders_tenant_assigned_crew']);
    expect(result.valid).toEqual([]);
  });

  it('los nombres publicados cubren ventana y cuadrilla', () => {
    expect([...EXECUTION_ORDERS_LIST_INDEX_NAMES]).toEqual([
      'idx_execution_orders_tenant_window_start',
      'idx_execution_orders_tenant_assigned_crew',
    ]);
  });
});
