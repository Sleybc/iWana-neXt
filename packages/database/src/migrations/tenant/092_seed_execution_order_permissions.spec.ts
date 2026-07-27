import { SeedExecutionOrderPermissions0920000000000 } from './092_seed_execution_order_permissions';

describe('SeedExecutionOrderPermissions092', () => {
  const PERMISSION_KEYS = [
    'operations.execution_orders.read',
    'operations.execution_orders.execute',
    'operations.execution_orders.supervise',
    'operations.execution_order_templates.read',
    'operations.execution_order_templates.manage',
    'operations.execution_events.redrive',
    'wfm.work_orders.execute',
  ];

  it('es reversible y no fija un schema tenant', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new SeedExecutionOrderPermissions0920000000000();
    await migration.up({ query } as never);
    await migration.down({ query } as never);

    const [upSql, downSql, downParams] = [
      query.mock.calls[0][0],
      query.mock.calls[1][0],
      query.mock.calls[1][1],
    ];

    // up: INSERT con ON CONFLICT DO NOTHING
    expect(upSql).toContain('INSERT INTO access_permission_catalog');
    expect(upSql).toContain('ON CONFLICT (tenant_id, permission_key) DO NOTHING');

    // down: DELETE con array de claves
    expect(downSql).toContain('DELETE FROM access_permission_catalog');
    expect(downSql).toContain('permission_key = ANY($1)');

    // down recibe el array exacto de claves sembradas
    expect(downParams).toEqual([PERMISSION_KEYS]);

    // Sin hardcode de schema de tenant
    const allSql = query.mock.calls.map((c: unknown[]) => (c as string[])[0]).join(' ');
    expect(allSql).not.toContain('tenant_alpha');
  });

  it('siembra exactamente 7 entradas (6 canónicas + 1 alias deprecado)', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new SeedExecutionOrderPermissions0920000000000();
    await migration.up({ query } as never);

    const upSql = query.mock.calls[0][0] as string;
    PERMISSION_KEYS.forEach((key) => {
      expect(upSql).toContain(key);
    });

    // Verifica que el alias deprecado está presente
    expect(upSql).toContain('wfm.work_orders.execute');
    expect(upSql).toContain('[DEPRECADO');
  });
});
