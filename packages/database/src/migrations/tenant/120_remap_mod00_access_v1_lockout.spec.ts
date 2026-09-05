import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RemapMod00AccessV1ToV21200000000000 } from './120_remap_mod00_access_v1_lockout';

const MIGRATION_SOURCE = readFileSync(
  resolve(__dirname, './120_remap_mod00_access_v1_lockout.ts'),
  'utf8',
);

describe('RemapMod00AccessV1ToV2120', () => {
  it('es reversible, idempotente y no fija schema tenant', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new RemapMod00AccessV1ToV21200000000000();
    await migration.up({ query } as never);
    await migration.down({ query } as never);

    const allSql = query.mock.calls.map((c: unknown[]) => (c as string[])[0]).join(' ');

    expect(allSql).toContain('current_schema()');
    expect(allSql).toContain(
      'ON CONFLICT (tenant_id, user_id, profile_id) WHERE is_active = true DO NOTHING',
    );
    expect(allSql).toContain('RETURNING id, user_id, profile_id, tenant_id');
    expect(allSql).toContain('v2.is_active = true');
    expect(allSql).not.toContain('tenant_alpha');
    expect(allSql).toContain('access_v1_remap_120_v2_assignments');
    expect(allSql).toContain('access_v1_remap_120_v1_assignments');
    expect(allSql).toContain('access_v1_remap_120_v1_profiles');
  });

  it('up remapea las 5 V1 a V2 por nombre y desactiva asignaciones V1 vivas', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await new RemapMod00AccessV1ToV21200000000000().up({ query } as never);
    const upSql = query.mock.calls.map((c: unknown[]) => (c as string[])[0]).join(' ');

    expect(upSql).toContain('Monitoreo operativo');
    expect(upSql).toContain('Soporte inicial');
    expect(upSql).toContain('Técnico de campo');
    expect(upSql).toContain('Contratista');
    expect(upSql).toContain('Auditor');
    expect(upSql).toContain('Acceso estándar NOC');
    expect(upSql).toContain('Acceso estándar Soporte');
    expect(upSql).toContain('Acceso estándar Técnico');
    expect(upSql).toContain('Acceso estándar Contratista');
    expect(upSql).toContain('Acceso estándar Auditoría');
    expect(upSql).toContain('INSERT INTO user_access_profiles');
    expect(upSql).toContain('ON CONFLICT (assignment_id) DO NOTHING');
    expect(upSql).toContain('SET is_active = false');
    expect(upSql).toContain('uap.is_active = true');
    expect(upSql).toContain('v2.is_active = true');
    expect(upSql).toContain('RETURNING id, user_id, profile_id, tenant_id');
  });

  it('down elimina solo asignaciones V2 de provenance y restaura V1', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await new RemapMod00AccessV1ToV21200000000000().down({ query } as never);
    const downSql = query.mock.calls.map((c: unknown[]) => (c as string[])[0]).join(' ');

    expect(downSql).toContain('DELETE FROM user_access_profiles');
    expect(downSql).toContain('AND id IN');
    expect(downSql).toContain('SELECT assignment_id');
    expect(downSql).toContain('access_v1_remap_120_v2_assignments');
    expect(downSql).toContain("tenant_schema !~ '^tenant_[a-z][a-z0-9_]{0,54}$'");
    expect(downSql).toContain('SET is_active = true');
    expect(downSql).toContain('previous_valid_to');
    expect(downSql).toContain('DROP TABLE IF EXISTS access_v1_remap_120_v1_profiles');
    expect(downSql).toContain('DROP TABLE IF EXISTS access_v1_remap_120_v1_assignments');
    expect(downSql).toContain('DROP TABLE IF EXISTS access_v1_remap_120_v2_assignments');
  });

  it('up dos veces no duplica (idempotencia SQL)', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new RemapMod00AccessV1ToV21200000000000();
    await migration.up({ query } as never);
    await migration.up({ query } as never);

    const upCalls = query.mock.calls.filter((c: unknown[]) =>
      String(c[0]).includes('INSERT INTO user_access_profiles'),
    );
    expect(upCalls.length).toBe(2);
    expect(String(upCalls[0][0])).toContain(
      'ON CONFLICT (tenant_id, user_id, profile_id) WHERE is_active = true DO NOTHING',
    );
  });

  it('no importa código de apps/api (boundary)', async () => {
    expect(MIGRATION_SOURCE).not.toMatch(/from ['"]@iwana\/api/);
    expect(MIGRATION_SOURCE).not.toMatch(/from ['"]\.\.\/\.\.\/\.\.\/apps\/api/);
  });
});
