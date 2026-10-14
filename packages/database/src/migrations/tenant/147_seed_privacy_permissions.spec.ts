import { SeedPrivacyPermissions1470000000000 } from './147_seed_privacy_permissions';

describe('SeedPrivacyPermissions147', () => {
  it('converge permisos privacy.read/manage y asigna ambos a la plantilla oficial', async () => {
    const query = jest.fn().mockResolvedValue(undefined);

    await new SeedPrivacyPermissions1470000000000().up({ query } as never);
    const sql = query.mock.calls.map((call) => String(call[0])).join('\n');

    expect(sql).toContain("'privacy.read'");
    expect(sql).toContain("'privacy.manage'");
    expect(sql).toContain("'Oficial de protección de datos'");
    expect(sql).toContain("'AUDITOR', NULL, true, true");
    expect(sql).toContain('ON CONFLICT (tenant_id, permission_key) DO UPDATE');
    expect(sql).toContain('ON CONFLICT (tenant_id, name) WHERE deleted_at IS NULL DO UPDATE');
    expect(sql).toContain('current_schema()');
    expect(sql).toContain('public.tenants');
  });

  it('down retira sus permisos y desactiva la plantilla privacy sin borrar perfiles', async () => {
    const query = jest.fn().mockResolvedValue(undefined);

    await new SeedPrivacyPermissions1470000000000().down({ query } as never);
    const sql = query.mock.calls.map((call) => String(call[0])).join('\n');

    expect(sql).toContain("permission_key IN ('privacy.read', 'privacy.manage')");
    expect(sql).toContain("name = 'Oficial de protección de datos'");
    expect(sql).toContain('SET is_active = false');
    expect(sql).not.toMatch(/DELETE FROM access_profiles/u);
  });
});
