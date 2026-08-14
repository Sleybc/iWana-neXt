import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { SeedOperationsTasksPermissions1120000000000 } from './112_seed_operations_tasks_permissions';

const MOD00_CATALOG_SOURCE = readFileSync(
  resolve(
    __dirname,
    '../../../../../apps/api/src/modules/access-control/access-control.constants.ts',
  ),
  'utf8',
);
const MIGRATION_SOURCE = readFileSync(
  resolve(__dirname, './112_seed_operations_tasks_permissions.ts'),
  'utf8',
);

describe('SeedOperationsTasksPermissions112', () => {
  const PERMISSION_KEYS = ['operations.tasks.read', 'operations.tasks.manage'] as const;

  it('es reversible, autocurativa y no fija un schema tenant', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new SeedOperationsTasksPermissions1120000000000();
    await migration.up({ query } as never);
    await migration.down({ query } as never);

    const upSql = query.mock.calls.find((call: unknown[]) =>
      String(call[0]).includes('DO $migration$'),
    )?.[0] as string;
    const downSql = query.mock.calls.find((call: unknown[]) =>
      String(call[0]).includes('DELETE FROM access_permission_catalog'),
    )?.[0] as string;

    expect(upSql).toContain('INSERT INTO access_permission_catalog');
    expect(upSql).toContain('ON CONFLICT (tenant_id, permission_key) DO NOTHING');
    expect(upSql).toContain('public.tenants');
    expect(upSql).toContain('current_schema()');
    expect(upSql).toContain('RAISE EXCEPTION');

    expect(downSql).toContain('DELETE FROM access_permission_catalog');
    expect(downSql).toContain('operations.tasks.read');
    expect(downSql).toContain('operations.tasks.manage');
    expect(downSql).toContain('current_schema()');

    const allSql = query.mock.calls.map((c: unknown[]) => (c as string[])[0]).join(' ');
    expect(allSql).not.toContain('tenant_alpha');
  });

  it('siembra exactamente las dos claves de tareas operativas', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await new SeedOperationsTasksPermissions1120000000000().up({ query } as never);

    const upSql = query.mock.calls.find((call: unknown[]) =>
      String(call[0]).includes('DO $migration$'),
    )?.[0] as string;
    PERMISSION_KEYS.forEach((key) => {
      expect(upSql).toContain(key);
    });
    expect(upSql).toContain('Ver tareas operativas de la empresa');
    expect(upSql).toContain('Crear, asignar y actualizar tareas operativas');
    expect(upSql).toContain('catalog_count <> 2');
  });

  it('demuestra equivalencia con MOD00 sin importar apps/api desde @iwana/db', async () => {
    expect(MIGRATION_SOURCE).not.toMatch(/from ['"]@iwana\/api/);
    expect(MIGRATION_SOURCE).not.toMatch(/from ['"]\.\.\/\.\.\/\.\.\/apps\/api/);
    expect(MIGRATION_SOURCE).toContain('apps/api');

    const query = jest.fn().mockResolvedValue(undefined);
    await new SeedOperationsTasksPermissions1120000000000().up({ query } as never);
    const upSql = query.mock.calls.find((call: unknown[]) =>
      String(call[0]).includes('DO $migration$'),
    )?.[0] as string;
    const rows = [
      ...upSql.matchAll(
        /\('([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*(true|false),\s*(true|false)\)/g,
      ),
    ];
    expect(rows).toHaveLength(2);

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
        const enumMember = key.replaceAll('.', '_').toUpperCase();
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
  });
});
