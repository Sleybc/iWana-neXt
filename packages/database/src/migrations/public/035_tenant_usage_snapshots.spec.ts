import { PlatformHealthSamples1784419222000 } from './034_platform_health_samples';
import { TenantUsageSnapshots1784419223000 } from './035_tenant_usage_snapshots';
import { PUBLIC_MIGRATIONS } from './index';

function runnerStub(): { calls: string[]; runner: { query: jest.Mock } } {
  const calls: string[] = [];
  const query = jest.fn(async (statement: string) => {
    calls.push(statement.replace(/\s+/gu, ' ').trim());
    return [];
  });
  return { calls, runner: { query } };
}

describe('035_tenant_usage_snapshots (ADR-114, CENTRO-CONTROL Fase 4)', () => {
  const migration = () => new TenantUsageSnapshots1784419223000();

  it('queda registrada inmediatamente después de la 034', () => {
    const index = PUBLIC_MIGRATIONS.indexOf(TenantUsageSnapshots1784419223000);
    expect(index).toBeGreaterThan(0);
    expect(PUBLIC_MIGRATIONS[index - 1]).toBe(PlatformHealthSamples1784419222000);
  });

  it('up crea la tabla con solo tres columnas y FK en cascada a tenants', async () => {
    const { calls, runner } = runnerStub();
    await migration().up(runner as never);
    expect(calls).toHaveLength(1);
    const ddl = calls[0]!;
    expect(ddl).toContain('CREATE TABLE "public"."tenant_usage_snapshots"');
    expect(ddl).toContain('PRIMARY KEY ("tenant_id")');
    expect(ddl).toContain('REFERENCES "public"."tenants" ("id") ON DELETE CASCADE');
    expect(ddl).toContain('"active_subscribers" integer NOT NULL');
    expect(ddl).toContain('"measured_at" timestamptz NOT NULL');
    expect(ddl.match(/" (uuid|integer|timestamptz) NOT NULL/gu)).toHaveLength(3);
  });

  it('down retira la tabla', async () => {
    const { calls, runner } = runnerStub();
    await migration().down(runner as never);
    expect(calls).toEqual(['DROP TABLE "public"."tenant_usage_snapshots"']);
  });
});
