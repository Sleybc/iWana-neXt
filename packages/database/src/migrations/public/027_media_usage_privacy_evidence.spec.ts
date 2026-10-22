import { MediaUsagePrivacyEvidence1784419215000 } from './027_media_usage_privacy_evidence';
import { EnableBtreeGist1784419216000 } from './028_enable_btree_gist';
import { PUBLIC_MIGRATIONS } from './index';

const CHECK_026 =
  "CHECK (((usage)::text = ANY ((ARRAY['logo'::character varying, 'seal'::character varying, " +
  "'favicon'::character varying, 'login_background'::character varying, " +
  "'general'::character varying, 'execution_evidence'::character varying, " +
  "'stratum_evidence'::character varying])::text[])))";

const CHECK_027 =
  "CHECK (((usage)::text = ANY ((ARRAY['logo'::character varying, 'seal'::character varying, " +
  "'favicon'::character varying, 'login_background'::character varying, " +
  "'general'::character varying, 'execution_evidence'::character varying, " +
  "'stratum_evidence'::character varying, 'privacy_evidence'::character varying])::text[])))";

interface StubOptions {
  present?: boolean;
  definition?: string | null;
  privacyRows?: number;
}

function queryRunnerStub(options: StubOptions = {}): {
  calls: string[];
  runner: { query: jest.Mock };
} {
  const calls: string[] = [];
  const definition = options.definition === undefined ? CHECK_026 : options.definition;
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
      return [{ total: options.privacyRows ?? 0 }];
    }
    return [];
  });

  return { calls, runner: { query } };
}

describe('027_media_usage_privacy_evidence', () => {
  it('queda después de la 026 con timestamp de 13 dígitos', () => {
    const migration = new MediaUsagePrivacyEvidence1784419215000();

    expect(migration.name).toBe('MediaUsagePrivacyEvidence1784419215000');
    expect(parseInt(migration.name.slice(-13), 10)).toBeGreaterThan(1784419214000);
    const index = PUBLIC_MIGRATIONS.indexOf(MediaUsagePrivacyEvidence1784419215000);
    expect(PUBLIC_MIGRATIONS[index + 1]).toBe(EnableBtreeGist1784419216000);
  });

  it('up agrega privacy_evidence y preserva todos los usos de la 026', async () => {
    const { calls, runner } = queryRunnerStub();

    await new MediaUsagePrivacyEvidence1784419215000().up(runner as never);

    const add = calls.find((sql) => sql.includes('ADD CONSTRAINT'));
    expect(add).toContain("'stratum_evidence', 'privacy_evidence'");
    expect(calls.some((sql) => sql.includes('DROP CONSTRAINT'))).toBe(true);
  });

  it('up es idempotente cuando privacy_evidence ya está admitido', async () => {
    const { calls, runner } = queryRunnerStub({ definition: CHECK_027 });

    await new MediaUsagePrivacyEvidence1784419215000().up(runner as never);

    expect(calls.some((sql) => sql.includes('DROP CONSTRAINT'))).toBe(false);
    expect(calls.some((sql) => sql.includes('ADD CONSTRAINT'))).toBe(false);
  });

  it('up falla sin alterar el CHECK si el estado previo no coincide con la 026', async () => {
    const { calls, runner } = queryRunnerStub({ definition: "CHECK (usage IN ('logo'))" });

    await expect(new MediaUsagePrivacyEvidence1784419215000().up(runner as never)).rejects.toThrow(
      /incompatible con el estado posterior a la 026/u,
    );
    expect(calls.some((sql) => sql.includes('DROP CONSTRAINT'))).toBe(false);
  });

  it('down bloquea si queda evidencia privacy y no cambia el CHECK', async () => {
    const { calls, runner } = queryRunnerStub({ definition: CHECK_027, privacyRows: 1 });

    await expect(
      new MediaUsagePrivacyEvidence1784419215000().down(runner as never),
    ).rejects.toThrow(/existen 1 asset\(s\) con usage = 'privacy_evidence'/u);
    expect(calls.join(' ')).not.toMatch(/DROP CONSTRAINT|ADD CONSTRAINT/u);
  });

  it('down restaura el CHECK de la 026 sin eliminar datos', async () => {
    const { calls, runner } = queryRunnerStub({ definition: CHECK_027 });

    await new MediaUsagePrivacyEvidence1784419215000().down(runner as never);

    const add = calls.find((sql) => sql.includes('ADD CONSTRAINT'));
    expect(add).toContain("'stratum_evidence')");
    expect(add).not.toContain('privacy_evidence');
    expect(calls.join(' ')).not.toMatch(/DELETE|UPDATE/u);
  });
});
