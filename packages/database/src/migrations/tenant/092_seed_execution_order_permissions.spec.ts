import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { SeedExecutionOrderPermissions0920000000000 } from './092_seed_execution_order_permissions';

const MOD00_CATALOG_SOURCE = readFileSync(
  resolve(
    __dirname,
    '../../../../../apps/api/src/modules/access-control/access-control.constants.ts',
  ),
  'utf8',
);
const ACCESS_CONTROL_SERVICE_SOURCE = readFileSync(
  resolve(
    __dirname,
    '../../../../../apps/api/src/modules/access-control/access-control.service.ts',
  ),
  'utf8',
);

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

    const upSql = query.mock.calls.find((call: unknown[]) =>
      String(call[0]).includes('DO $migration$'),
    )?.[0] as string;
    const downSql = query.mock.calls.find((call: unknown[]) =>
      String(call[0]).includes('DO $rollback$'),
    )?.[0] as string;
    const downParams = query.mock.calls.find((call: unknown[]) =>
      String(call[0]).includes('DO $rollback$'),
    )?.[1];

    // up: INSERT con ON CONFLICT DO NOTHING
    expect(upSql).toContain('INSERT INTO access_permission_catalog');
    expect(upSql).toContain('ON CONFLICT (tenant_id, permission_key) DO NOTHING');

    // down no borra filas compartidas con el seeder runtime de MOD00.
    expect(downSql).toContain('DELETE FROM access_permission_catalog');
    expect(downSql).toContain('execution_order_permission_seed_092');
    expect(downSql).toContain('seed_fingerprint');
    expect(downSql).toContain('catalog_entry_xmin');
    expect(downParams).toBeUndefined();

    // Sin hardcode de schema de tenant
    const allSql = query.mock.calls.map((c: unknown[]) => (c as string[])[0]).join(' ');
    expect(allSql).not.toContain('tenant_alpha');
  });

  it('siembra exactamente 7 entradas (6 canónicas + 1 alias deprecado)', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new SeedExecutionOrderPermissions0920000000000();
    await migration.up({ query } as never);

    const upSql = query.mock.calls.find((call: unknown[]) =>
      String(call[0]).includes('DO $migration$'),
    )?.[0] as string;
    PERMISSION_KEYS.forEach((key) => {
      expect(upSql).toContain(key);
    });

    // Verifica que el alias deprecado está presente
    expect(upSql).toContain('wfm.work_orders.execute');
    expect(upSql).toContain('RAISE EXCEPTION');
    expect(upSql).toContain('public.tenants');
    expect(upSql).toContain('MOD00_ACCESS_V1_CATALOG');
    expect(upSql).toContain('apps/api');
  });

  it('demuestra equivalencia integral con MOD00 sin importar entre paquetes', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await new SeedExecutionOrderPermissions0920000000000().up({ query } as never);
    const upSql = query.mock.calls.find((call: unknown[]) =>
      String(call[0]).includes('DO $migration$'),
    )?.[0] as string;
    const rows = [
      ...upSql.matchAll(
        /\('([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*(true|false),\s*(true|false)\)/g,
      ),
    ];
    expect(rows).toHaveLength(7);

    rows.forEach(
      ([
        ,
        key,
        moduleKey,
        action,
        description,
        catalogVersion,
        availability,
        isSystem,
        isActive,
      ]) => {
        if (!key || !moduleKey || !action || !description || !catalogVersion || !availability) {
          throw new Error('Unexpected permission seed row shape');
        }
        const enumMember =
          key === 'wfm.work_orders.execute'
            ? 'WFM_WORK_ORDERS_EXECUTE'
            : key.replaceAll('.', '_').toUpperCase();
        const definition = MOD00_CATALOG_SOURCE.match(
          new RegExp(`permissionKey: AccessPermissionKey\\.${enumMember},([\\s\\S]*?)\\n\\s*\\},`),
        )?.[1];
        expect(definition).toBeDefined();
        expect(definition).toContain(`moduleKey: '${moduleKey}'`);
        expect(definition).toContain(`action: '${action}'`);
        expect(definition).toContain(`description: '${description}'`);
        expect(definition).toContain('catalogVersion: version');
        expect(definition).toContain(`AccessPermissionAvailability.${availability}`);
        expect(catalogVersion).toBe('MOD00_ACCESS_V1');
        expect(isSystem).toBe('true');
        expect(isActive).toBe('true');
      },
    );
    expect(MOD00_CATALOG_SOURCE).toContain(
      'const version = AccessPermissionCatalogVersion.MOD00_ACCESS_V1',
    );
    expect(ACCESS_CONTROL_SERVICE_SOURCE).toContain('current.isSystem = true');
    expect(ACCESS_CONTROL_SERVICE_SOURCE).toContain('current.isActive = true');
  });
});
