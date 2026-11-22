import { TenantUsageSnapshots1784419223000 } from './035_tenant_usage_snapshots';
import { PlatformAuditTenantStatusEventsIndex1784419224000 } from './036_platform_audit_tenant_status_events_index';
import { PUBLIC_MIGRATIONS } from './index';

function runnerStub(): { calls: string[]; runner: { query: jest.Mock } } {
  const calls: string[] = [];
  const query = jest.fn(async (statement: string) => {
    calls.push(statement.replace(/\s+/gu, ' ').trim());
    return [];
  });
  return { calls, runner: { query } };
}

describe('036_platform_audit_tenant_status_events_index', () => {
  const migration = () => new PlatformAuditTenantStatusEventsIndex1784419224000();

  it('queda registrada inmediatamente después de la 035', () => {
    const index = PUBLIC_MIGRATIONS.indexOf(PlatformAuditTenantStatusEventsIndex1784419224000);
    expect(index).toBeGreaterThan(0);
    expect(PUBLIC_MIGRATIONS[index - 1]).toBe(TenantUsageSnapshots1784419223000);
  });

  it('up crea el índice parcial (created_at, id) solo para las filas de Tenant', async () => {
    const { calls, runner } = runnerStub();
    await migration().up(runner as never);
    expect(calls).toEqual([
      `CREATE INDEX "idx_pal_tenant_created_id" ON "public"."platform_audit_logs" ("created_at", "id") WHERE "entity_type" = 'Tenant'`,
    ]);
  });

  it('down lo retira (simétrico)', async () => {
    const { calls, runner } = runnerStub();
    await migration().down(runner as never);
    expect(calls).toEqual(['DROP INDEX "public"."idx_pal_tenant_created_id"']);
  });
});
