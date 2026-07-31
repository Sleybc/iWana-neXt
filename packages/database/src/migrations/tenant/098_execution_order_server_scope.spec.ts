import { ExecutionOrderServerScope0980000000000 } from './098_execution_order_server_scope';

describe('ExecutionOrderServerScope098', () => {
  it('agrega el scope y backfillea desde la relación canónica de WFM', async () => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
        return [];
      }),
    } as never;

    await new ExecutionOrderServerScope0980000000000().up(queryRunner);

    expect(queries[0]).toContain('ADD COLUMN IF NOT EXISTS organization_site_id UUID');
    expect(queries[1]).toContain('idx_execution_orders_tenant_organization_site');
    expect(queries[2]).toContain('FROM schedule_events schedule_event');
    expect(queries[2]).toContain('execution_order.tenant_id = schedule_event.tenant_id');
    expect(queries[2]).toContain('execution_order.organization_site_id IS NULL');
  });

  it('bloquea el down con datos y no los elimina silenciosamente', async () => {
    const query = jest.fn().mockResolvedValue([{ total: 1 }]);
    const previous = process.env.IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN;
    delete process.env.IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN;

    try {
      await expect(
        new ExecutionOrderServerScope0980000000000().down({ query } as never),
      ).rejects.toThrow('Rollback de ExecutionOrderServerScope bloqueado');
      expect(query).toHaveBeenCalledTimes(1);
    } finally {
      if (previous === undefined) delete process.env.IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN;
      else process.env.IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN = previous;
    }
  });
});
