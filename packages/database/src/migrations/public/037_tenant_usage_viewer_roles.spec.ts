import { PlatformAuditTenantStatusEventsIndex1784419224000 } from './036_platform_audit_tenant_status_events_index';
import { TenantUsageViewerRoles1784419225000 } from './037_tenant_usage_viewer_roles';
import { PUBLIC_MIGRATIONS } from './index';

function runnerStub(): { calls: string[]; runner: { query: jest.Mock } } {
  const calls: string[] = [];
  const query = jest.fn(async (statement: string) => {
    calls.push(statement.replace(/\s+/gu, ' ').trim());
    return [];
  });
  return { calls, runner: { query } };
}

describe('037_tenant_usage_viewer_roles', () => {
  const migration = () => new TenantUsageViewerRoles1784419225000();

  it('queda registrada inmediatamente después de la 036', () => {
    const index = PUBLIC_MIGRATIONS.indexOf(TenantUsageViewerRoles1784419225000);
    expect(index).toBeGreaterThan(0);
    expect(PUBLIC_MIGRATIONS[index - 1]).toBe(PlatformAuditTenantStatusEventsIndex1784419224000);
  });

  it('up añade la columna vacía por defecto y el CHECK acotado a IWANA_SUPPORT', async () => {
    const { calls, runner } = runnerStub();
    await migration().up(runner as never);
    expect(calls).toEqual([
      `ALTER TABLE "public"."platform_branding_settings" ADD COLUMN "tenant_usage_viewer_roles" text[] NOT NULL DEFAULT '{}'::text[], ADD CONSTRAINT "chk_pbs_tenant_usage_viewer_roles" CHECK ("tenant_usage_viewer_roles" <@ ARRAY['IWANA_SUPPORT']::text[])`,
    ]);
  });

  it('down retira el CHECK y la columna (simétrico)', async () => {
    const { calls, runner } = runnerStub();
    await migration().down(runner as never);
    expect(calls).toEqual([
      `ALTER TABLE "public"."platform_branding_settings" DROP CONSTRAINT "chk_pbs_tenant_usage_viewer_roles", DROP COLUMN "tenant_usage_viewer_roles"`,
    ]);
  });
});
