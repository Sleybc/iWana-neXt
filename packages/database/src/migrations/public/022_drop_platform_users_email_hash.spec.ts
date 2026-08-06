import { DropPlatformUsersEmailHash1784419210000 } from './022_drop_platform_users_email_hash';

const FLAG = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

function queryRunnerStub(pendingHmac = 0): { runner: { query: jest.Mock }; queries: string[] } {
  const queries: string[] = [];

  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql);
      if (sql.replace(/\s+/g, ' ').toLowerCase().includes('count(*)')) {
        return [{ total: pendingHmac }];
      }
      return [];
    }),
  };

  return { runner, queries };
}

describe('022_drop_platform_users_email_hash', () => {
  const originalFlag = process.env[FLAG];

  afterEach(() => {
    if (originalFlag === undefined) delete process.env[FLAG];
    else process.env[FLAG] = originalFlag;
  });

  it('está diferida tras IWANA_APPLY_PII_CONTRACT', () => {
    // Sin esto se aplicaría en la misma corrida que la 021 y el respaldo
    // SHA-256 desaparecería antes de haber servido para nada.
    expect(new DropPlatformUsersEmailHash1784419210000().deferredBy).toBe(
      'IWANA_APPLY_PII_CONTRACT',
    );
  });

  it('se ordena después de la 021', () => {
    const name = new DropPlatformUsersEmailHash1784419210000().name;

    expect(parseInt(name.substr(-13), 10)).toBeGreaterThan(1784419209000);
  });

  it('retira email_hash con su UNIQUE y su índice', async () => {
    const { runner, queries } = queryRunnerStub(0);

    await new DropPlatformUsersEmailHash1784419210000().up(runner as never);

    const all = queries.join(' ');
    expect(all).toContain('DROP INDEX IF EXISTS "public"."idx_platform_users_email_hash"');
    expect(all).toContain('DROP CONSTRAINT IF EXISTS "uq_platform_users_email_hash"');
    expect(all).toContain('DROP COLUMN IF EXISTS "email_hash"');
  });

  it('bloquea el DROP si algún platform_user no tiene email_hmac', async () => {
    const { runner, queries } = queryRunnerStub(2);

    await expect(new DropPlatformUsersEmailHash1784419210000().up(runner as never)).rejects.toThrow(
      /2 platform_user\(s\) sin email_hmac/,
    );

    expect(queries.join(' ')).not.toContain('DROP COLUMN');
  });

  it('down exige el flag destructivo', async () => {
    delete process.env[FLAG];
    const { runner, queries } = queryRunnerStub(0);

    await expect(
      new DropPlatformUsersEmailHash1784419210000().down(runner as never),
    ).rejects.toThrow(new RegExp(`${FLAG}=true`));

    expect(queries).toHaveLength(0);
  });

  it('down con flag recrea email_hash desde el HMAC', async () => {
    process.env[FLAG] = 'true';
    const { runner, queries } = queryRunnerStub(0);

    await new DropPlatformUsersEmailHash1784419210000().down(runner as never);

    const all = queries.join(' ');
    expect(all).toContain('ADD COLUMN IF NOT EXISTS "email_hash"');
    expect(all).toContain('SET "email_hash" = "email_hmac"');
  });
});
