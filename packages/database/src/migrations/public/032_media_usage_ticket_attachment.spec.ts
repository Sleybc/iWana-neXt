import { MediaUsage } from '../../entities/media-asset.entity';
import { TenantPurgeEvidence1784419219000 } from './031_tenant_purge_evidence';
import { MediaUsageTicketAttachment1784419220000 } from './032_media_usage_ticket_attachment';
import { PUBLIC_MIGRATIONS } from './index';

const CHECK_027 =
  "CHECK (((usage)::text = ANY ((ARRAY['logo'::character varying, 'seal'::character varying, " +
  "'favicon'::character varying, 'login_background'::character varying, " +
  "'general'::character varying, 'execution_evidence'::character varying, " +
  "'stratum_evidence'::character varying, 'privacy_evidence'::character varying])::text[])))";

const CHECK_032 = CHECK_027.replace(
  "'privacy_evidence'::character varying]",
  "'privacy_evidence'::character varying, 'ticket_attachment'::character varying]",
);

interface StubOptions {
  present?: boolean;
  definition?: string | null;
  rows?: number;
}

function queryRunnerStub(options: StubOptions = {}): {
  calls: string[];
  runner: { query: jest.Mock };
} {
  const calls: string[] = [];
  const definition = options.definition === undefined ? CHECK_027 : options.definition;
  const query = jest.fn(async (statement: string) => {
    const sql = statement.replace(/\s+/gu, ' ').trim();
    calls.push(sql);
    if (sql.includes("to_regclass('public.media_assets')")) {
      return [{ present: options.present ?? true }];
    }
    if (sql.includes('pg_get_constraintdef')) {
      return definition === null ? [] : [{ definition }];
    }
    if (sql.includes('COUNT(*)')) {
      return [{ total: options.rows ?? 0 }];
    }
    return [];
  });
  return { calls, runner: { query } };
}

describe('032_media_usage_ticket_attachment (spec MOD09 adjuntos en tickets §2.1)', () => {
  const migration = () => new MediaUsageTicketAttachment1784419220000();

  it('el enum de la entidad declara ticket_attachment', () => {
    expect(MediaUsage.TICKET_ATTACHMENT).toBe('ticket_attachment');
  });

  it('queda registrada inmediatamente después de la 031', () => {
    expect(migration().name).toBe('MediaUsageTicketAttachment1784419220000');
    const index = PUBLIC_MIGRATIONS.indexOf(MediaUsageTicketAttachment1784419220000);
    expect(index).toBeGreaterThan(0);
    expect(PUBLIC_MIGRATIONS[index - 1]).toBe(TenantPurgeEvidence1784419219000);
  });

  it('up agrega ticket_attachment y preserva los usos de la 027', async () => {
    const { calls, runner } = queryRunnerStub();
    await migration().up(runner as never);
    const add = calls.find((sql) => sql.includes('ADD CONSTRAINT'));
    expect(add).toContain("'privacy_evidence', 'ticket_attachment'");
    expect(add).toContain("'execution_evidence'");
  });

  it('up es idempotente cuando ya está admitido', async () => {
    const { calls, runner } = queryRunnerStub({ definition: CHECK_032 });
    await migration().up(runner as never);
    expect(calls.join(' ')).not.toMatch(/DROP CONSTRAINT|ADD CONSTRAINT/u);
  });

  it('up falla sin tocar el CHECK si el estado previo no coincide con la 027', async () => {
    const { calls, runner } = queryRunnerStub({ definition: "CHECK (usage IN ('logo'))" });
    await expect(migration().up(runner as never)).rejects.toThrow(
      /incompatible con el estado posterior a la 027/u,
    );
    expect(calls.join(' ')).not.toMatch(/DROP CONSTRAINT|ADD CONSTRAINT/u);
  });

  it('up falla si public.media_assets no existe', async () => {
    const { runner } = queryRunnerStub({ present: false });
    await expect(migration().up(runner as never)).rejects.toThrow(/media_assets no existe/u);
  });

  it('down bloquea si quedan adjuntos y no cambia el CHECK', async () => {
    const { calls, runner } = queryRunnerStub({ definition: CHECK_032, rows: 2 });
    await expect(migration().down(runner as never)).rejects.toThrow(
      /existen 2 asset\(s\) con usage = 'ticket_attachment'/u,
    );
    expect(calls.join(' ')).not.toMatch(/DROP CONSTRAINT|ADD CONSTRAINT/u);
  });

  it('down restaura el CHECK de la 027 sin borrar datos', async () => {
    const { calls, runner } = queryRunnerStub({ definition: CHECK_032 });
    await migration().down(runner as never);
    const add = calls.find((sql) => sql.includes('ADD CONSTRAINT'));
    expect(add).toContain("'privacy_evidence')");
    expect(add).not.toContain('ticket_attachment');
    expect(calls.join(' ')).not.toMatch(/DELETE|UPDATE/u);
  });
});
