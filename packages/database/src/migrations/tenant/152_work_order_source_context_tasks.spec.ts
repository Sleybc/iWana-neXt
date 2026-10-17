import { WorkOrderSourceContextTasks1520000000000 } from './152_work_order_source_context_tasks';
import { isTenantMigrationTransactional } from './runner';

function fakeRunner(usage: { workOrders: number; visitRequests: number }) {
  const queries: string[] = [];
  const queryRunner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql);
      return sql.includes('COUNT(*)') ? [usage] : [];
    }),
  };
  return { queries, queryRunner };
}

describe('152_work_order_source_context_tasks', () => {
  const migration = new WorkOrderSourceContextTasks1520000000000();

  it('corre en la transacción por migración del runner', () => {
    expect(isTenantMigrationTransactional(migration)).toBe(true);
  });

  it('up agrega TASKS con guarda idempotente filtrada por current_schema()', async () => {
    const { queries, queryRunner } = fakeRunner({ workOrders: 0, visitRequests: 0 });

    await migration.up(queryRunner as never);

    expect(queries).toHaveLength(1);
    const [sql] = queries;
    expect(sql).toContain("t.typname = 'work_order_source_context'");
    expect(sql).toContain('t.typnamespace = current_schema()::regnamespace');
    expect(sql).toContain("e.enumlabel = 'TASKS'");
    expect(sql).toMatch(
      /IF NOT EXISTS[\s\S]*ALTER TYPE work_order_source_context ADD VALUE 'TASKS'/,
    );
  });

  it.each([[{ workOrders: 1, visitRequests: 0 }], [{ workOrders: 0, visitRequests: 2 }]])(
    'down no cambia nada si TASKS está en uso (%o)',
    async (usage) => {
      const { queries, queryRunner } = fakeRunner(usage);
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

      await migration.down(queryRunner as never);

      expect(queries).toHaveLength(1);
      expect(queries[0]).toContain("source_context::text = 'TASKS'");
      expect(queries[0]).toContain("origin_context::text = 'TASKS'");
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('down sin cambios'));
      warn.mockRestore();
    },
  );

  it('down sin uso recrea el tipo sin TASKS y migra las dos columnas antes de borrar el viejo', async () => {
    const { queries, queryRunner } = fakeRunner({ workOrders: 0, visitRequests: 0 });

    await migration.down(queryRunner as never);

    const rename = queries.findIndex((sql) =>
      sql.includes('RENAME TO work_order_source_context_old'),
    );
    const create = queries.findIndex((sql) =>
      sql.includes('CREATE TYPE work_order_source_context AS ENUM'),
    );
    const workOrders = queries.findIndex((sql) =>
      sql.includes('USING source_context::text::work_order_source_context'),
    );
    const visitRequests = queries.findIndex((sql) =>
      sql.includes('USING origin_context::text::work_order_source_context'),
    );
    const drop = queries.findIndex((sql) =>
      sql.includes('DROP TYPE IF EXISTS work_order_source_context_old'),
    );

    expect([rename, create, workOrders, visitRequests, drop].every((index) => index > 0)).toBe(
      true,
    );
    expect(rename).toBeLessThan(create);
    expect(create).toBeLessThan(workOrders);
    expect(create).toBeLessThan(visitRequests);
    expect(Math.max(workOrders, visitRequests)).toBeLessThan(drop);
    expect(queries[create]).not.toContain('TASKS');
    expect(queries[create]).toMatch(/'CRM', 'ASSURANCE', 'PROVISIONING', 'MANUAL'/);
  });
});
