import { ExecutionOrderScheduleUnique0910000000000 } from './091_execution_order_schedule_unique';

describe('ExecutionOrderScheduleUnique091', () => {
  it('es reversible y no fija un schema tenant', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new ExecutionOrderScheduleUnique0910000000000();
    await migration.up({ query } as never);
    await migration.down({ query } as never);
    expect(query.mock.calls[0][0]).toContain(
      'DROP INDEX IF EXISTS idx_execution_orders_tenant_schedule_event',
    );
    expect(query.mock.calls[1][0]).toContain('UNIQUE INDEX');
    expect(query.mock.calls[1][0]).toContain('tenant_id, schedule_event_id');
    expect(query.mock.calls[2][0]).toContain('DROP INDEX');
    expect(query.mock.calls.join(' ')).not.toContain('tenant_alpha');
  });
});
