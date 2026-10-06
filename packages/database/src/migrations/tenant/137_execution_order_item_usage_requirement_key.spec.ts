import { ExecutionOrderItemUsageRequirementKey1370000000000 } from './137_execution_order_item_usage_requirement_key';

function buildRunner(queryImpl: (sql: string) => unknown) {
  const queries: string[] = [];
  const queryRunner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql);
      return queryImpl(sql);
    }),
  } as never;
  return { queryRunner, queries };
}

describe('ExecutionOrderItemUsageRequirementKey137', () => {
  it('añade la columna nullable sin backfill', async () => {
    const { queryRunner, queries } = buildRunner(() => []);

    await new ExecutionOrderItemUsageRequirementKey1370000000000().up(queryRunner);

    expect(queries.join('\n')).toContain(
      'ADD COLUMN IF NOT EXISTS requirement_key varchar(128) NULL',
    );
    expect(queries.join('\n')).not.toMatch(/UPDATE\s+execution_order_item_usage/iu);
  });

  it('bloquea rollback si se perderían claves asignadas', async () => {
    const { queryRunner, queries } = buildRunner(() => Promise.resolve([{ total: 2 }]));

    await expect(
      new ExecutionOrderItemUsageRequirementKey1370000000000().down(queryRunner),
    ).rejects.toThrow(/Rollback de ExecutionOrderItemUsageRequirementKey bloqueado: 2 consumo/);
    expect(queries).toHaveLength(1);
  });

  it('revierte cuando no hay claves asignadas', async () => {
    const { queryRunner, queries } = buildRunner(() => Promise.resolve([{ total: 0 }]));

    await new ExecutionOrderItemUsageRequirementKey1370000000000().down(queryRunner);

    expect(queries.join('\n')).toContain('DROP COLUMN IF EXISTS requirement_key');
  });
});
