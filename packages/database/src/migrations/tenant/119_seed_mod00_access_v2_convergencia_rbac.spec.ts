import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SeedMod00AccessV21190000000000 } from './119_seed_mod00_access_v2_convergencia_rbac';

const MIGRATION_SOURCE = readFileSync(
  resolve(__dirname, './119_seed_mod00_access_v2_convergencia_rbac.ts'),
  'utf8',
);

describe('SeedMod00AccessV2119', () => {
  it('es reversible, idempotente y no fija schema tenant', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new SeedMod00AccessV21190000000000();
    await migration.up({ query } as never);
    await migration.down({ query } as never);

    const allSql = query.mock.calls.map((c: unknown[]) => (c as string[])[0]).join(' ');

    // Up debe insertar catálogo V2 con ON CONFLICT y validar schema
    expect(allSql).toContain('INSERT INTO access_permission_catalog');
    expect(allSql).toContain('ON CONFLICT (tenant_id, permission_key) DO UPDATE');
    expect(allSql).toContain('current_schema()');
    expect(allSql).toContain('MOD00_ACCESS_V2');
    expect(allSql).toContain('ON CONFLICT (tenant_id, name) WHERE deleted_at IS NULL DO UPDATE');
    expect(allSql).not.toContain('tenant_alpha');

    // Down debe revertir promociones y nuevas claves
    expect(allSql).toContain('DELETE FROM access_permission_catalog');
    expect(allSql).toContain('crm.subscribers.read');
    expect(allSql).toContain('crm.customers.read');
  });

  it('siembra 6 nuevas y 6 promovidas con descripciones sin "en fase futura"', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await new SeedMod00AccessV21190000000000().up({ query } as never);
    const upSql = query.mock.calls.find((call: unknown[]) =>
      String(call[0]).includes('INSERT INTO access_permission_catalog'),
    )?.[0] as string;

    // Nuevas
    expect(upSql).toContain('crm.subscribers.read');
    expect(upSql).toContain('Ver Suscriptores');
    expect(upSql).toContain('crm.expedientes.read');
    expect(upSql).toContain('Ver Oportunidades');
    expect(upSql).toContain('inventory.purchasing.read');
    expect(upSql).toContain('Ver compras y cotizaciones');

    // Promovidas sin fase futura
    expect(upSql).toContain('Ver catálogo comercial');
    expect(upSql).not.toContain('Ver catálogo comercial en fase futura');
    expect(upSql).toContain('Ver tickets y PQR');
    expect(upSql).not.toContain('Ver tickets/PQR en fase futura');
    expect(upSql).toContain('Ver inventario');
    expect(upSql).not.toContain('Ver inventario futuro');

    // Deprecadas desactivadas
    expect(upSql).toContain('crm.customers.read');
    // Verifica que el UPDATE de deprecación está presente
    const fullSql = query.mock.calls.map((c: unknown[]) => (c as string[])[0]).join(' ');
    expect(fullSql).toContain('UPDATE access_permission_catalog');
    expect(fullSql).toContain('is_active = false');
  });

  it('crea 9 plantillas estándar y asigna set-based a usuarios sin perfiles', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await new SeedMod00AccessV21190000000000().up({ query } as never);
    const upSql = query.mock.calls.map((c: unknown[]) => (c as string[])[0]).join(' ');

    expect(upSql).toContain('Administrador general');
    expect(upSql).toContain('Acceso estándar NOC');
    expect(upSql).toContain('Acceso estándar Soporte');
    expect(upSql).toContain('Acceso estándar Comercial');
    expect(upSql).toContain('Acceso estándar Técnico');
    expect(upSql).toContain('Acceso estándar Contable');
    expect(upSql).toContain('Acceso estándar RRHH');
    expect(upSql).toContain('Acceso estándar Contratista');
    expect(upSql).toContain('Acceso estándar Auditoría');

    // Asignación set-based con INSERT...SELECT y NOT EXISTS
    expect(upSql).toContain('INSERT INTO user_access_profiles');
    expect(upSql).toContain('NOT EXISTS');
    expect(upSql).toContain("status = 'ACTIVE'");
    expect(upSql).toContain('deleted_at IS NULL');
    expect(upSql).toContain('access_v2_seed_119');

    // Provenance
    expect(upSql).toContain('CREATE TABLE IF NOT EXISTS access_v2_seed_119');
  });

  it('down elimina solo lo creado por esta migración (provenance)', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await new SeedMod00AccessV21190000000000().down({ query } as never);
    const downSql = query.mock.calls.map((c: unknown[]) => (c as string[])[0]).join(' ');

    expect(downSql).toContain('access_v2_seed_119');
    expect(downSql).toContain('DELETE FROM user_access_profiles');
    expect(downSql).toContain('UPDATE access_profiles SET is_active = false');
    expect(downSql).toContain('DELETE FROM access_permission_catalog');
  });

  it('no importa código de apps/api (boundary)', async () => {
    expect(MIGRATION_SOURCE).not.toMatch(/from ['"]@iwana\/api/);
    expect(MIGRATION_SOURCE).not.toMatch(/from ['"]\.\.\/\.\.\/\.\.\/apps\/api/);
  });
});
