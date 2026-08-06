import { DropPiiSha256HashColumns1090000000000 } from './109_drop_pii_sha256_hash_columns';

const FLAG = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

type CountRow = Record<string, number>;

/**
 * Stub del QueryRunner: devuelve los conteos de los guardianes y registra el DDL.
 * `gaps` describe cuántas filas quedan sin HMAC en cada tabla.
 */
function queryRunnerWith(gaps: {
  expediente?: number;
  users?: number;
  subscribers?: Partial<{ doc: number; email: number; phone: number }>;
}): { runner: { query: jest.Mock }; queries: string[] } {
  const queries: string[] = [];

  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql);
      const normalized = sql.replace(/\s+/g, ' ').toLowerCase();

      if (normalized.includes('from expediente_records') && normalized.includes('count')) {
        return [{ total: gaps.expediente ?? 0 }] satisfies CountRow[];
      }
      if (normalized.includes('from users') && normalized.includes('count')) {
        return [{ total: gaps.users ?? 0 }] satisfies CountRow[];
      }
      if (normalized.includes('from subscribers') && normalized.includes('count')) {
        return [
          {
            doc: gaps.subscribers?.doc ?? 0,
            email: gaps.subscribers?.email ?? 0,
            phone: gaps.subscribers?.phone ?? 0,
          },
        ] satisfies CountRow[];
      }

      return [];
    }),
  };

  return { runner, queries };
}

describe('109_drop_pii_sha256_hash_columns', () => {
  const originalFlag = process.env[FLAG];

  afterEach(() => {
    if (originalFlag === undefined) delete process.env[FLAG];
    else process.env[FLAG] = originalFlag;
  });

  it('dropea las columnas SHA-256 cuando no quedan huecos de HMAC', async () => {
    const { runner, queries } = queryRunnerWith({});

    await new DropPiiSha256HashColumns1090000000000().up(runner as never);

    const all = queries.join(' ');
    expect(all).toContain('DROP COLUMN IF EXISTS phone_hash');
    expect(all).toContain('DROP COLUMN IF EXISTS document_number_hash');
    expect(all).toContain('ALTER TABLE users DROP COLUMN IF EXISTS email_hash');
  });

  it('bloquea el DROP si algún subscriber tiene ciphertext sin HMAC', async () => {
    // El agujero original: 108 dejaba el HMAC en NULL sin fallar y 109 borraba
    // igual los digests SHA-256, sin forma de recalcularlos.
    const { runner, queries } = queryRunnerWith({ subscribers: { email: 3 } });

    await expect(new DropPiiSha256HashColumns1090000000000().up(runner as never)).rejects.toThrow(
      /subscribers con ciphertext pero sin HMAC.*email=3/s,
    );

    expect(queries.join(' ')).not.toContain('DROP COLUMN');
  });

  it('informa los tres campos de subscribers por separado', async () => {
    const { runner } = queryRunnerWith({ subscribers: { doc: 1, email: 2, phone: 4 } });

    await expect(new DropPiiSha256HashColumns1090000000000().up(runner as never)).rejects.toThrow(
      /document_number=1, email=2, phone=4/,
    );
  });

  it('sigue bloqueando por expediente_records y por users', async () => {
    const { runner: expedienteRunner } = queryRunnerWith({ expediente: 2 });
    await expect(
      new DropPiiSha256HashColumns1090000000000().up(expedienteRunner as never),
    ).rejects.toThrow(/2 expediente\(s\) sin document_number_hmac/);

    const { runner: usersRunner } = queryRunnerWith({ users: 5 });
    await expect(
      new DropPiiSha256HashColumns1090000000000().up(usersRunner as never),
    ).rejects.toThrow(/5 user\(s\) sin email_hmac/);
  });

  it('down exige el flag destructivo', async () => {
    delete process.env[FLAG];
    const { runner, queries } = queryRunnerWith({});

    await expect(new DropPiiSha256HashColumns1090000000000().down(runner as never)).rejects.toThrow(
      new RegExp(`${FLAG}=true`),
    );

    expect(queries).toHaveLength(0);
  });

  it('down con flag recrea las columnas hash desde los HMAC', async () => {
    process.env[FLAG] = 'true';
    const { runner, queries } = queryRunnerWith({});

    await new DropPiiSha256HashColumns1090000000000().down(runner as never);

    const all = queries.join(' ');
    expect(all).toContain('SET email_hash = email_hmac');
    expect(all).toContain('SET document_number_hash = document_number_hmac');
  });
});
