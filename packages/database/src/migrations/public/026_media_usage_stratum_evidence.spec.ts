import { MediaUsageStratumEvidence1784419214000 } from './026_media_usage_stratum_evidence';
import { MediaUsagePrivacyEvidence1784419215000 } from './027_media_usage_privacy_evidence';
import { PUBLIC_MIGRATIONS } from './index';

const CHECK_020 =
  "CHECK (((usage)::text = ANY ((ARRAY['logo'::character varying, 'seal'::character varying, " +
  "'favicon'::character varying, 'login_background'::character varying, " +
  "'general'::character varying, 'execution_evidence'::character varying])::text[])))";

const CHECK_026 =
  "CHECK (((usage)::text = ANY ((ARRAY['logo'::character varying, 'seal'::character varying, " +
  "'favicon'::character varying, 'login_background'::character varying, " +
  "'general'::character varying, 'execution_evidence'::character varying, " +
  "'stratum_evidence'::character varying])::text[])))";

const CHECK_INCOMPATIBLE =
  "CHECK ((usage)::text = ANY ((ARRAY['logo'::character varying, 'general'::character varying])::text[]))";

interface StubOptions {
  /** `public.media_assets` existe. Por defecto, sí. */
  present?: boolean;
  /** Definición del CHECK; `null` simula que no existe. Por defecto, la de la 020. */
  definition?: string | null;
  /** Filas con `usage = 'stratum_evidence'`. Por defecto, ninguna. */
  stratumRows?: number;
}

/** Simula el QueryRunner respondiendo según la sentencia; registra todo el SQL emitido. */
function queryRunnerStub(options: StubOptions = {}): {
  calls: string[];
  runner: { query: jest.Mock };
} {
  const calls: string[] = [];
  const definition = options.definition === undefined ? CHECK_020 : options.definition;

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
      return [{ total: options.stratumRows ?? 0 }];
    }
    return [];
  });

  return { calls, runner: { query } };
}

describe('026_media_usage_stratum_evidence', () => {
  it('conserva un timestamp de 13 dígitos posterior a la 025 y queda en último lugar', () => {
    const migration = new MediaUsageStratumEvidence1784419214000();

    expect(migration.name).toBe('MediaUsageStratumEvidence1784419214000');
    // Exactamente lo que hace TypeORM en MigrationExecutor.getMigrations.
    expect(parseInt(migration.name.slice(-13), 10)).toBeGreaterThan(1784419213000);
    expect(PUBLIC_MIGRATIONS[PUBLIC_MIGRATIONS.length - 2]).toBe(
      MediaUsageStratumEvidence1784419214000,
    );
    expect(PUBLIC_MIGRATIONS[PUBLIC_MIGRATIONS.length - 1]).toBe(
      MediaUsagePrivacyEvidence1784419215000,
    );
  });

  it('up sustituye el CHECK por uno que añade stratum_evidence y conserva execution_evidence', async () => {
    const { calls, runner } = queryRunnerStub();

    await new MediaUsageStratumEvidence1784419214000().up(runner as never);

    const alter = calls.filter((sql) => sql.startsWith('ALTER TABLE "public"."media_assets"'));
    expect(alter).toHaveLength(2);
    expect(alter[0]).toContain('DROP CONSTRAINT IF EXISTS "chk_media_assets_usage"');
    expect(alter[1]).toContain(
      "ADD CONSTRAINT \"chk_media_assets_usage\" CHECK ( \"usage\" IN ('logo', 'seal', 'favicon', " +
        "'login_background', 'general', 'execution_evidence', 'stratum_evidence') )",
    );
  });

  it('up no emite DDL si el CHECK ya admite stratum_evidence (idempotente)', async () => {
    const { calls, runner } = queryRunnerStub({ definition: CHECK_026 });

    await new MediaUsageStratumEvidence1784419214000().up(runner as never);

    expect(calls.some((sql) => sql.includes('DROP CONSTRAINT'))).toBe(false);
    expect(calls.some((sql) => sql.includes('ADD CONSTRAINT'))).toBe(false);
  });

  it('up aborta sin DDL si el CHECK previo no es el de la 020', async () => {
    const { calls, runner } = queryRunnerStub({ definition: CHECK_INCOMPATIBLE });

    await expect(new MediaUsageStratumEvidence1784419214000().up(runner as never)).rejects.toThrow(
      /definición incompatible con el estado previo de la 020/u,
    );
    expect(calls.some((sql) => sql.includes('DROP CONSTRAINT'))).toBe(false);
  });

  it('up aborta sin DDL alternativo si public.media_assets no existe', async () => {
    const { calls, runner } = queryRunnerStub({ present: false });

    await expect(new MediaUsageStratumEvidence1784419214000().up(runner as never)).rejects.toThrow(
      /008_create_media_assets_table/u,
    );
    expect(calls.join(' ')).not.toMatch(/CREATE TABLE|ALTER TABLE/u);
  });

  it('down aborta con filas stratum_evidence sin borrarlas ni alterar el CHECK', async () => {
    const { calls, runner } = queryRunnerStub({ definition: CHECK_026, stratumRows: 2 });

    await expect(
      new MediaUsageStratumEvidence1784419214000().down(runner as never),
    ).rejects.toThrow(/existen 2 asset\(s\) con usage = 'stratum_evidence'/u);

    expect(calls.join(' ')).not.toMatch(/DELETE|UPDATE|DROP CONSTRAINT|ADD CONSTRAINT/u);
  });

  it('down restaura el CHECK de la 020 cuando no hay filas stratum_evidence', async () => {
    const { calls, runner } = queryRunnerStub({ definition: CHECK_026, stratumRows: 0 });

    await new MediaUsageStratumEvidence1784419214000().down(runner as never);

    const add = calls.find((sql) => sql.includes('ADD CONSTRAINT'));
    expect(add).toContain("'general', 'execution_evidence')");
    expect(add).not.toContain('stratum_evidence');
    expect(calls.join(' ')).not.toMatch(/DELETE|UPDATE/u);
  });
});
