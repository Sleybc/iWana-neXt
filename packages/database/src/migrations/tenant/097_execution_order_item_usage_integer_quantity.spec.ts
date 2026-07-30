import { ExecutionOrderItemUsageIntegerQuantity0970000000000 } from './097_execution_order_item_usage_integer_quantity';

describe('ExecutionOrderItemUsageIntegerQuantity097', () => {
  it('convierte quantity a entero positivo y revierte el cambio', async () => {
    const queries: string[] = [];
    const query = jest.fn(async (sql: string) => {
      queries.push(sql);
      return [];
    });
    const migration = new ExecutionOrderItemUsageIntegerQuantity0970000000000();

    await migration.up({ query } as never);
    await migration.down({ query } as never);

    expect(queries[0]).toContain('quantity <= 0 OR quantity <> trunc(quantity)');
    expect(queries[1]).toContain('ALTER COLUMN quantity TYPE INTEGER');
    expect(queries[2]).toContain('ADD CONSTRAINT chk_execution_order_item_usage_quantity_positive');
    expect(queries[3]).toContain(
      'DROP CONSTRAINT IF EXISTS chk_execution_order_item_usage_quantity_positive',
    );
    expect(queries[4]).toContain('ALTER COLUMN quantity TYPE NUMERIC(12,2)');
  });
});
