import type { QueryRunner } from 'typeorm';
import {
  CreateExecutionOrderStatusTransitions1320000000000,
  dropInvalidExecutionOrderTransitionIndexIfExists,
  EXECUTION_ORDER_TRANSITION_INDEX_NAMES,
  verifyExecutionOrderTransitionIndexes,
} from './132_create_execution_order_status_transitions';

/**
 * Crea un QueryRunner mock que responde una secuencia de queries esperadas.
 * Cada respuesta declara el prefijo SQL esperado (normalizado) y el resultado.
 */
function mockQueryRunner(responses: Array<{ sql: string; result: unknown }>): QueryRunner {
  let callIndex = 0;
  const query = jest.fn(async (sql: string, _params?: unknown[]) => {
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

describe('132 execution-order status transitions', () => {
  const migration = new CreateExecutionOrderStatusTransitions1320000000000();

  it('corre fuera de transacción (ADR-066: CREATE INDEX CONCURRENTLY)', () => {
    expect(migration.transactional).toBe(false);
  });

  it('up crea la tabla y el índice por orden e instante con CONCURRENTLY', async () => {
    const qr = mockQueryRunner([
      { sql: 'DO $$', result: [] },
      { sql: 'CREATE TABLE IF NOT EXISTS execution_order_status_transitions', result: [] },
      // Limpieza de inválidos: SELECT sin filas → sin DROP.
      { sql: 'SELECT 1 FROM pg_index', result: [] },
      {
        sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_execution_order_transitions_order_changed_at',
        result: [],
      },
      // Verificación post-migración: índice válido.
      {
        sql: 'SELECT c.relname AS index_name',
        result: [
          { index_name: 'idx_execution_order_transitions_order_changed_at', is_valid: true },
        ],
      },
    ]);

    const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await migration.up(qr);

    expect(qr.query).toHaveBeenCalledTimes(5);
    expect(consoleWarn).not.toHaveBeenCalled();
    expect(consoleLog).toHaveBeenCalledWith('[132] All 1 transition indexes verified valid.');

    consoleLog.mockRestore();
    consoleWarn.mockRestore();
  });

  it('la tabla cubre origen, destino, instante, actor y motivo (tenant scope)', async () => {
    const seen: string[] = [];
    const qr = {
      query: jest.fn(async (sql: string) => {
        seen.push(sql.replace(/\s+/g, ' ').trim());
        if (sql.includes('SELECT c.relname')) {
          return [
            { index_name: 'idx_execution_order_transitions_order_changed_at', is_valid: true },
          ];
        }
        return [];
      }),
    } as unknown as QueryRunner;

    const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await migration.up(qr);

    const createTable = seen.find((s) =>
      s.includes('CREATE TABLE IF NOT EXISTS execution_order_status_transitions'),
    );
    expect(createTable).toBeDefined();
    for (const column of [
      'tenant_id',
      'execution_order_id',
      'from_status',
      'to_status',
      'changed_at',
      'changed_by',
      'reason',
    ]) {
      expect(createTable).toContain(column);
    }
    // Sin duraciones calculadas (ADR-089 §D2/R5): ninguna columna de duración.
    expect(createTable).not.toMatch(/duration|effective|worked|hours/i);

    const createIndex = seen.find((s) =>
      s.includes('idx_execution_order_transitions_order_changed_at'),
    );
    expect(createIndex).toContain('CONCURRENTLY');
    expect(createIndex).toContain('(tenant_id, execution_order_id, changed_at)');

    consoleLog.mockRestore();
    consoleWarn.mockRestore();
  });

  it('down revierte índice y tabla sin throw incondicional', async () => {
    const seen: string[] = [];
    const qr = {
      query: jest.fn(async (sql: string) => {
        seen.push(sql.replace(/\s+/g, ' ').trim());
        return [];
      }),
    } as unknown as QueryRunner;

    await migration.down(qr);

    expect(seen).toEqual([
      'DROP INDEX CONCURRENTLY IF EXISTS idx_execution_order_transitions_order_changed_at',
      'DROP TABLE IF EXISTS execution_order_status_transitions',
    ]);
  });

  it('no califica DDL con schema de tenant (search_path del runner)', async () => {
    const seen: string[] = [];
    const qr = {
      query: jest.fn(async (sql: string) => {
        seen.push(sql);
        if (sql.includes('SELECT c.relname')) {
          return [
            { index_name: 'idx_execution_order_transitions_order_changed_at', is_valid: true },
          ];
        }
        return [];
      }),
    } as unknown as QueryRunner;

    const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await migration.up(qr);

    const ddl = seen.filter((s) => s.includes('execution_order_status_transitions'));
    expect(ddl.length).toBeGreaterThan(0);
    for (const statement of ddl) {
      expect(statement).not.toMatch(/tenant_[a-z0-9_]+ *\./);
    }

    consoleLog.mockRestore();
    consoleWarn.mockRestore();
  });

  it('dropInvalidExecutionOrderTransitionIndexIfExists limpia solo índices INVALID en whitelist', async () => {
    const qr = mockQueryRunner([
      { sql: 'SELECT 1 FROM pg_index', result: [{ '?column?': 1 }] },
      {
        sql: 'DROP INDEX CONCURRENTLY IF EXISTS "idx_execution_order_transitions_order_changed_at"',
        result: [],
      },
    ]);

    const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});

    await dropInvalidExecutionOrderTransitionIndexIfExists(
      qr,
      'idx_execution_order_transitions_order_changed_at',
    );

    expect(qr.query).toHaveBeenCalledTimes(2);
    expect(consoleLog).toHaveBeenCalledWith(
      '[132] cleaned up invalid index: idx_execution_order_transitions_order_changed_at',
    );

    consoleLog.mockRestore();
  });

  it('dropInvalidExecutionOrderTransitionIndexIfExists rechaza nombres fuera de la whitelist', async () => {
    const qr = mockQueryRunner([{ sql: 'SELECT 1 FROM pg_index', result: [{ '?column?': 1 }] }]);

    await expect(
      dropInvalidExecutionOrderTransitionIndexIfExists(qr, 'idx_execution_orders_tenant_status'),
    ).rejects.toThrow('[132] index name not in whitelist');
  });

  it('verifyExecutionOrderTransitionIndexes reporta inválidos y faltantes', async () => {
    const qr = {
      query: jest.fn(async () => [
        { index_name: 'idx_execution_order_transitions_order_changed_at', is_valid: false },
      ]),
    } as unknown as QueryRunner;

    const result = await verifyExecutionOrderTransitionIndexes(qr);

    expect(result.invalid).toEqual(['idx_execution_order_transitions_order_changed_at']);
    expect(result.missing).toEqual([]);
    expect(result.valid).toEqual([]);
  });

  it('el nombre publicado cubre orden e instante', () => {
    expect([...EXECUTION_ORDER_TRANSITION_INDEX_NAMES]).toEqual([
      'idx_execution_order_transitions_order_changed_at',
    ]);
  });
});
