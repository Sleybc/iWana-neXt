import { AddPiiHmacColumns1080000000000 } from './108_add_pii_hmac_columns';

const FLAG = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

/**
 * Stub del QueryRunner. `pendingUsers` son los users sin email_hmac que ve el
 * `up`; `orphanUsers`, los users sin email_hash que ve el `down` (altas
 * ocurridas mientras la 109 estuvo diferida).
 */
function queryRunnerStub(
  { pendingUsers = 0, orphanUsers = 0 } = {},
  hashKeyPresent = true,
): { runner: { query: jest.Mock }; queries: string[] } {
  const queries: string[] = [];

  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql);
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      if (normalized.startsWith('select id,')) {
        return [];
      }
      if (normalized.includes('count(*)')) {
        return [{ total: normalized.includes('email_hash is null') ? orphanUsers : pendingUsers }];
      }
      return [];
    }),
  };

  if (!hashKeyPresent) {
    delete process.env.PII_HASH_KEY;
  }

  return { runner, queries };
}

describe('108_add_pii_hmac_columns', () => {
  const originalFlag = process.env[FLAG];

  afterEach(() => {
    if (originalFlag === undefined) delete process.env[FLAG];
    else process.env[FLAG] = originalFlag;
  });

  it('libera el NOT NULL de users.email_hash para el estado intermedio', async () => {
    // Sin esto, con la 109 diferida el primer alta de usuario fallaría: el
    // runtime ya no escribe email_hash y la columna seguiría siendo NOT NULL.
    const { runner, queries } = queryRunnerStub();

    await new AddPiiHmacColumns1080000000000().up(runner as never);

    const all = queries.join(' ');
    expect(all).toContain('ALTER COLUMN email_hash DROP NOT NULL');
    expect(all).toContain('ALTER COLUMN email_hmac SET NOT NULL');
  });

  it('el UNIQUE de email_hmac se ancla por conrelid, no solo por nombre', async () => {
    // pg_constraint es global al catálogo: filtrar solo por conname haría que un
    // tenant se saltara el UNIQUE porque otro schema ya lo tiene.
    const { runner, queries } = queryRunnerStub();

    await new AddPiiHmacColumns1080000000000().up(runner as never);

    const addConstraint = queries.find((sql) => sql.includes('uq_users_email_hmac UNIQUE'));
    expect(addConstraint).toContain("conrelid = 'users'::regclass");
  });

  it('aborta si tras el backfill quedan users sin email_hmac', async () => {
    const { runner, queries } = queryRunnerStub({ pendingUsers: 4 });

    await expect(new AddPiiHmacColumns1080000000000().up(runner as never)).rejects.toThrow(
      /quedan 4 users sin email_hmac/,
    );

    expect(queries.join(' ')).not.toContain('SET NOT NULL');
  });

  it('down restituye el NOT NULL cuando no hay altas posteriores', async () => {
    delete process.env[FLAG];
    const { runner, queries } = queryRunnerStub({ orphanUsers: 0 });

    await new AddPiiHmacColumns1080000000000().down(runner as never);

    const all = queries.join(' ');
    expect(all).toContain('ALTER COLUMN email_hash SET NOT NULL');
    expect(all).toContain('DROP COLUMN IF EXISTS email_hmac');
    expect(all).not.toContain('SET email_hash = email_hmac');
  });

  it('down bloquea sin flag si hay usuarios creados sin SHA-256', async () => {
    delete process.env[FLAG];
    const { runner, queries } = queryRunnerStub({ orphanUsers: 7 });

    await expect(new AddPiiHmacColumns1080000000000().down(runner as never)).rejects.toThrow(
      new RegExp(`7 user\\(s\\).*${FLAG}=true`, 's'),
    );

    expect(queries.join(' ')).not.toContain('ALTER COLUMN');
  });

  it('down con flag degrada esas filas al digest HMAC', async () => {
    process.env[FLAG] = 'true';
    const { runner, queries } = queryRunnerStub({ orphanUsers: 7 });

    await new AddPiiHmacColumns1080000000000().down(runner as never);

    const all = queries.join(' ');
    expect(all).toContain('SET email_hash = email_hmac');
    expect(all).toContain('ALTER COLUMN email_hash SET NOT NULL');
  });
});
