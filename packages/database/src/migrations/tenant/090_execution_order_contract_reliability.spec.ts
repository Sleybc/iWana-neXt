import { ExecutionOrderContractReliability0900000000000 } from './090_execution_order_contract_reliability';

describe('ExecutionOrderContractReliability090', () => {
  it('crea y revierte la unicidad tenant+schedule_event sin fijar schema', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new ExecutionOrderContractReliability0900000000000();
    await migration.up({ query } as never);
    await migration.down({ query } as never);
    expect(query.mock.calls[1][0]).toContain('UNIQUE INDEX');
    expect(query.mock.calls[1][0]).toContain('tenant_id, schedule_event_id');
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('DROP INDEX IF EXISTS uq_execution_orders_tenant_schedule_event'),
      ),
    ).toBe(true);
    expect(query.mock.calls.join(' ')).not.toContain('tenant_alpha');
  });
});
