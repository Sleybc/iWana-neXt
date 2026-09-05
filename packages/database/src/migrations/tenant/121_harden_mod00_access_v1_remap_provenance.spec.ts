import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HardenMod00AccessV1RemapProvenance12100000000000 } from './121_harden_mod00_access_v1_remap_provenance';

const MIGRATION_SOURCE = readFileSync(
  resolve(__dirname, './121_harden_mod00_access_v1_remap_provenance.ts'),
  'utf8',
);

describe('HardenMod00AccessV1RemapProvenance121', () => {
  it('es reversible, idempotente y no fija schema tenant', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new HardenMod00AccessV1RemapProvenance12100000000000();
    await migration.up({ query } as never);
    await migration.down({ query } as never);

    const allSql = query.mock.calls.map((c: unknown[]) => (c as string[])[0]).join(' ');

    expect(allSql).toContain('current_schema()');
    expect(allSql).toContain(
      'ON CONFLICT (tenant_id, user_id, profile_id) WHERE is_active = true DO NOTHING',
    );
    expect(allSql).not.toContain('tenant_alpha');
    expect(allSql).toContain('access_v1_remap_121_v2_assignments');
    expect(allSql).toContain('ADD COLUMN IF NOT EXISTS assignment_id');
  });

  it('up exige V2 activa y persiste provenance por assignment_id', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await new HardenMod00AccessV1RemapProvenance12100000000000().up({ query } as never);
    const upSql = query.mock.calls.map((c: unknown[]) => (c as string[])[0]).join(' ');

    expect(upSql).toContain('v2.is_active = true');
    expect(upSql).toContain('RETURNING id, tenant_id');
    expect(upSql).toContain('ON CONFLICT (assignment_id) DO NOTHING');
    expect(upSql).toContain("tenant_schema !~ '^tenant_[a-z][a-z0-9_]{0,54}$'");
  });

  it('down borra solo asignaciones V2 por assignment_id y valida schema', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await new HardenMod00AccessV1RemapProvenance12100000000000().down({ query } as never);
    const downSql = query.mock.calls.map((c: unknown[]) => (c as string[])[0]).join(' ');

    expect(downSql).toContain('AND id IN');
    expect(downSql).toContain('SELECT assignment_id');
    expect(downSql).toContain("tenant_schema !~ '^tenant_[a-z][a-z0-9_]{0,54}$'");
    expect(downSql).toContain('DROP TABLE IF EXISTS access_v1_remap_121_v2_assignments');
  });

  it('no importa código de apps/api (boundary)', async () => {
    expect(MIGRATION_SOURCE).not.toMatch(/from ['"]@iwana\/api/);
    expect(MIGRATION_SOURCE).not.toMatch(/from ['"]\.\.\/\.\.\/\.\.\/apps\/api/);
  });
});
