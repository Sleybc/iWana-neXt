import { ExecutionOrderInventoryRequestRecovery1380000000000 } from './138_execution_order_inventory_request_recovery';

function buildQueryRunner() {
  const queries: string[] = [];
  const queryRunner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql);
      return [];
    }),
  } as never;
  return { queryRunner, queries };
}

describe('ExecutionOrderInventoryRequestRecovery138', () => {
  it('añade reason y cursor de reintentos sin backfill destructivo', async () => {
    const { queryRunner, queries } = buildQueryRunner();

    await new ExecutionOrderInventoryRequestRecovery1380000000000().up(queryRunner);

    const sql = queries.join('\n');
    expect(sql).toContain('rejection_reason_code text NULL');
    expect(sql).toContain('last_requested_at timestamptz NULL');
    expect(sql).toContain('request_attempts integer NOT NULL DEFAULT 1');
    expect(sql).not.toMatch(/UPDATE\s+execution_order_item_usage/iu);
  });

  it('revierte las tres columnas de la 138', async () => {
    const { queryRunner, queries } = buildQueryRunner();

    await new ExecutionOrderInventoryRequestRecovery1380000000000().down(queryRunner);

    expect(queries.join('\n')).toContain('DROP COLUMN IF EXISTS request_attempts');
    expect(queries.join('\n')).toContain('DROP COLUMN IF EXISTS last_requested_at');
    expect(queries.join('\n')).toContain('DROP COLUMN IF EXISTS rejection_reason_code');
  });
});
