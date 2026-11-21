import { MediaUsageTicketAttachment1784419220000 } from './032_media_usage_ticket_attachment';
import { DashboardStatusAndAuditCursorIndexes1784419221000 } from './033_dashboard_status_and_audit_cursor_indexes';
import { PUBLIC_MIGRATIONS } from './index';

function runnerStub(): { calls: string[]; runner: { query: jest.Mock } } {
  const calls: string[] = [];
  const query = jest.fn(async (statement: string) => {
    calls.push(statement.replace(/\s+/gu, ' ').trim());
    return [];
  });
  return { calls, runner: { query } };
}

describe('033_dashboard_status_and_audit_cursor_indexes (WEB-DASHBOARD Ola 2, E-4)', () => {
  const migration = () => new DashboardStatusAndAuditCursorIndexes1784419221000();

  it('queda registrada inmediatamente después de la 032', () => {
    const index = PUBLIC_MIGRATIONS.indexOf(DashboardStatusAndAuditCursorIndexes1784419221000);
    expect(index).toBeGreaterThan(0);
    expect(PUBLIC_MIGRATIONS[index - 1]).toBe(MediaUsageTicketAttachment1784419220000);
  });

  it('up crea el índice por status y el cursor (created_at, id)', async () => {
    const { calls, runner } = runnerStub();
    await migration().up(runner as never);
    expect(calls).toEqual([
      'CREATE INDEX "idx_tenants_status" ON "public"."tenants" ("status")',
      'CREATE INDEX "idx_pal_created_id" ON "public"."platform_audit_logs" ("created_at", "id")',
    ]);
  });

  it('down retira exactamente los índices de up, en orden inverso', async () => {
    const { calls, runner } = runnerStub();
    await migration().down(runner as never);
    expect(calls).toEqual([
      'DROP INDEX "public"."idx_pal_created_id"',
      'DROP INDEX "public"."idx_tenants_status"',
    ]);
  });
});
