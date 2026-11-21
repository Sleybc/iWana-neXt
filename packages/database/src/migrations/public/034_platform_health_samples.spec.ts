import { DashboardStatusAndAuditCursorIndexes1784419221000 } from './033_dashboard_status_and_audit_cursor_indexes';
import { PlatformHealthSamples1784419222000 } from './034_platform_health_samples';
import { PUBLIC_MIGRATIONS } from './index';

function runnerStub(): { calls: string[]; runner: { query: jest.Mock } } {
  const calls: string[] = [];
  const query = jest.fn(async (statement: string) => {
    calls.push(statement.replace(/\s+/gu, ' ').trim());
    return [];
  });
  return { calls, runner: { query } };
}

describe('034_platform_health_samples (CENTRO-CONTROL Fase 3, P2)', () => {
  const migration = () => new PlatformHealthSamples1784419222000();

  it('queda registrada inmediatamente después de la 033', () => {
    const index = PUBLIC_MIGRATIONS.indexOf(PlatformHealthSamples1784419222000);
    expect(index).toBeGreaterThan(0);
    expect(PUBLIC_MIGRATIONS[index - 1]).toBe(DashboardStatusAndAuditCursorIndexes1784419221000);
  });

  it('up crea la tabla sin tenant_id, api_ok nulo y el índice por sampled_at', async () => {
    const { calls, runner } = runnerStub();
    await migration().up(runner as never);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain('CREATE TABLE "public"."platform_health_samples"');
    expect(calls[0]).toContain('"api_ok" boolean,');
    expect(calls[0]).toContain('"db_ok" boolean NOT NULL');
    expect(calls[0]).toContain('"redis_ok" boolean NOT NULL');
    expect(calls[0]).toContain(`CHECK (jsonb_typeof("queues") = 'array')`);
    expect(calls[0]).not.toContain('tenant');
    expect(calls[1]).toBe(
      'CREATE INDEX "idx_platform_health_samples_sampled_at" ON "public"."platform_health_samples" ("sampled_at")',
    );
  });

  it('down retira el índice y la tabla, en orden inverso', async () => {
    const { calls, runner } = runnerStub();
    await migration().down(runner as never);
    expect(calls).toEqual([
      'DROP INDEX "public"."idx_platform_health_samples_sampled_at"',
      'DROP TABLE "public"."platform_health_samples"',
    ]);
  });
});
