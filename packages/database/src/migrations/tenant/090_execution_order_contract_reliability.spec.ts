import { ExecutionOrderContractReliability0900000000000 } from './090_execution_order_contract_reliability';

describe('ExecutionOrderContractReliability090', () => {
  const originalFlag = process.env['IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN'];

  afterAll(() => {
    if (originalFlag === undefined) delete process.env['IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN'];
    else process.env['IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN'] = originalFlag;
  });

  it('crea índices de retención por columna de corte y revierte sin fijar schema', async () => {
    delete process.env['IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN'];
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('to_regclass')) return [{ present: false }];
      return [];
    });
    const migration = new ExecutionOrderContractReliability0900000000000();
    await migration.up({ query } as never);
    await migration.down({ query } as never);
    const sql = query.mock.calls.map(([statement]) => String(statement)).join(' ');
    expect(sql).toContain('idx_execution_order_outbox_retention');
    expect(sql).toContain('idx_execution_order_inbox_retention');
    expect(sql).toContain('idx_execution_order_idempotency_retention');
    expect(sql).toContain('idx_execution_order_audit_intent_retention');
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('DROP TABLE IF EXISTS execution_order_outbox_events'),
      ),
    ).toBe(true);
    expect(sql).not.toContain('uq_execution_orders_tenant_schedule_event');
    expect(sql).not.toContain('tenant_alpha');
  });

  it('bloquea down con datos y no elimina antes del guard', async () => {
    delete process.env['IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN'];
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('to_regclass')) return [{ present: true }];
      if (sql.includes('COUNT(*)::int')) return [{ total: 1 }];
      return [];
    });
    const migration = new ExecutionOrderContractReliability0900000000000();

    await expect(migration.down({ query } as never)).rejects.toThrow(
      /IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true/,
    );
    expect(query.mock.calls.map(([sql]) => String(sql)).join(' ')).not.toContain('DROP TABLE');
  });
});
