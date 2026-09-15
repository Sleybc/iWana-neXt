import { ExecutionOrderOriginIdentity1350000000000 } from './135_execution_order_origin_identity';

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

describe('ExecutionOrderOriginIdentity135', () => {
  it('up relaja las tres columnas y muda la unicidad al eje de origen', async () => {
    const { queryRunner, queries } = buildRunner(() => []);

    await new ExecutionOrderOriginIdentity1350000000000().up(queryRunner);

    const all = queries.join('\n');
    expect(all).toContain('schedule_event_id DROP NOT NULL');
    expect(all).toContain('planned_window_start_at DROP NOT NULL');
    expect(all).toContain('planned_window_end_at DROP NOT NULL');
    // Paso 4: el índice de evento se reexpresa como parcial explícito.
    expect(all).toContain('uq_execution_orders_tenant_schedule_event');
    expect(all).toContain('WHERE schedule_event_id IS NOT NULL');
    // Réplica del patrón 035 sobre la tupla de origen de la OT.
    expect(all).toContain('uq_execution_orders_active_origin_unique');
    expect(all).toContain(
      'ON execution_orders (tenant_id, origin_context, origin_ref_id, work_type)',
    );
    expect(all).toContain('origin_ref_id IS NOT NULL');
    expect(all).toContain(
      `'CANCELLED', 'COMPLETED', 'COMPLETED_WITH_OBSERVATIONS', 'NOT_EXECUTED'`,
    );
  });

  it('up se bloquea con mensaje accionable ante duplicados activos preexistentes', async () => {
    const { queryRunner } = buildRunner(() =>
      Promise.resolve([
        {
          tenant_id: 'tenant-001',
          origin_context: 'ASSURANCE',
          origin_ref: 'TCK-1',
          work_type: 'SUPPORT',
          total: 2,
        },
      ]),
    );

    await expect(new ExecutionOrderOriginIdentity1350000000000().up(queryRunner)).rejects.toThrow(
      /duplicadas por origen.*ASSURANCE\/TCK-1\/SUPPORT.*cancele o cierre/i,
    );
  });

  it('down declara su límite ante OT sin evento en vez de romper a ciegas (CA-04)', async () => {
    const { queryRunner, queries } = buildRunner(() =>
      Promise.resolve([{ total: 2, without_event: 2, without_window: 1 }]),
    );

    await expect(new ExecutionOrderOriginIdentity1350000000000().down(queryRunner)).rejects.toThrow(
      /Rollback de ExecutionOrderOriginIdentity bloqueado: 2 OT\(s\) sin evento \(2\) o sin ventana \(1\).*E3.*no borra OTs/i,
    );
    // El conteo precede a todo DDL: nada se tocó.
    expect(queries).toHaveLength(1);
  });

  it('down restaura NOT NULL e índice 091 cuando no hay OT sin evento ni ventana', async () => {
    const { queryRunner, queries } = buildRunner(() =>
      Promise.resolve([{ total: 0, without_event: 0, without_window: 0 }]),
    );

    await new ExecutionOrderOriginIdentity1350000000000().down(queryRunner);

    const all = queries.join('\n');
    expect(all).toContain('DROP INDEX IF EXISTS uq_execution_orders_active_origin_unique');
    expect(all).toContain('schedule_event_id SET NOT NULL');
    expect(all).toContain('planned_window_start_at SET NOT NULL');
    expect(all).toContain('planned_window_end_at SET NOT NULL');
    // Restaura el índice 091 en su forma original (único total).
    const restored = queries.filter((sql) =>
      sql.includes('uq_execution_orders_tenant_schedule_event'),
    );
    expect(restored.some((sql) => !sql.includes('WHERE'))).toBe(true);
  });
});
