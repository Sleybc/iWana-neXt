import { PlatformUsersEmailHmac1784419209000 } from './021_platform_users_email_hmac';

const FLAG = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';
const LEGACY_NAME = 'PlatformUsersEmailHmac0210000000000';

function queryRunnerStub(
  pendingHmac = 0,
  orphanHash = 0,
): { runner: { query: jest.Mock }; queries: string[] } {
  const queries: string[] = [];

  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql);
      const normalized = sql.replace(/\s+/g, ' ').toLowerCase();
      if (normalized.includes('count(*)')) {
        // El `down` cuenta filas con email_hash NULL; el `up`, con email_hmac NULL.
        return [{ total: normalized.includes('"email_hash" is null') ? orphanHash : pendingHmac }];
      }
      return [];
    }),
  };

  return { runner, queries };
}

describe('021_platform_users_email_hmac', () => {
  const originalFlag = process.env[FLAG];

  afterEach(() => {
    if (originalFlag === undefined) delete process.env[FLAG];
    else process.env[FLAG] = originalFlag;
  });

  it('conserva el nombre con timestamp de 13 dígitos posterior a la 020', () => {
    // El sufijo es lo único que TypeORM mira para ordenar y para elegir qué
    // revertir; con `0210000000000` esta migración se colaba antes de
    // 001_create_public_schema y `migration:revert` nunca la seleccionaba.
    const migration = new PlatformUsersEmailHmac1784419209000();

    expect(migration.name).toBe('PlatformUsersEmailHmac1784419209000');
    expect(parseInt(migration.name.substr(-13), 10)).toBeGreaterThan(1784419208000);
  });

  it('up impone NOT NULL + UNIQUE en email_hmac y conserva email_hash como respaldo', async () => {
    const { runner, queries } = queryRunnerStub(0);

    await new PlatformUsersEmailHmac1784419209000().up(runner as never);

    const all = queries.join(' ');
    expect(all).toContain('ADD COLUMN IF NOT EXISTS "email_hmac"');
    expect(all).toContain('ALTER COLUMN "email_hmac" SET NOT NULL');
    // El contract vive en la 022: aquí email_hash solo pierde el NOT NULL, para
    // que el alta de platform_users siga funcionando en el estado intermedio.
    expect(all).toContain('ALTER COLUMN "email_hash" DROP NOT NULL');
    expect(all).not.toContain('DROP COLUMN IF EXISTS "email_hash"');
  });

  it('up es reejecutable: el UNIQUE se añade condicionado y anclado a la tabla', async () => {
    const { runner, queries } = queryRunnerStub(0);

    await new PlatformUsersEmailHmac1784419209000().up(runner as never);

    const addConstraint = queries.find((sql) => sql.includes('uq_platform_users_email_hmac'));
    expect(addConstraint).toContain('IF NOT EXISTS');
    // Anclado por conrelid: filtrar solo por conname mira el catálogo entero.
    expect(addConstraint).toContain('conrelid');
  });

  it('up libera el NOT NULL de email_hash solo si la columna existe', async () => {
    // Regresión: una base donde la 022 ya corrió no tiene email_hash; el up
    // reejecutado no debe abortar tocando una columna inexistente.
    const { runner, queries } = queryRunnerStub(0);

    await new PlatformUsersEmailHmac1784419209000().up(runner as never);

    const dropNotNull = queries.find((sql) => sql.includes('email_hash" DROP NOT NULL'));
    expect(dropNotNull).toBeDefined();
    expect(dropNotNull).toContain('DO $$');
    expect(dropNotNull).toContain('information_schema.columns');
    expect(dropNotNull).toContain("table_name = 'platform_users'");
  });

  it('up limpia el registro del nombre corto anterior', async () => {
    const { runner } = queryRunnerStub(0);

    await new PlatformUsersEmailHmac1784419209000().up(runner as never);

    const deleteCall = runner.query.mock.calls.find(([sql]: [string]) =>
      sql.includes('DELETE FROM "public"."typeorm_migrations"'),
    );
    expect(deleteCall?.[1]).toEqual([LEGACY_NAME]);
  });

  it('up aborta si queda algún platform_user sin email_hmac', async () => {
    const { runner, queries } = queryRunnerStub(2);

    await expect(new PlatformUsersEmailHmac1784419209000().up(runner as never)).rejects.toThrow(
      /quedan 2 platform_users sin email_hmac/,
    );

    expect(queries.join(' ')).not.toContain('DROP COLUMN');
  });

  it('down sin filas huérfanas no necesita flag: los SHA-256 siguen intactos', async () => {
    delete process.env[FLAG];
    const { runner, queries } = queryRunnerStub(0, 0);

    await new PlatformUsersEmailHmac1784419209000().down(runner as never);

    const all = queries.join(' ');
    expect(all).toContain('ALTER COLUMN "email_hash" SET NOT NULL');
    expect(all).toContain('DROP COLUMN IF EXISTS "email_hmac"');
    // No se toca email_hash: revertir aquí es reversible de verdad.
    expect(all).not.toContain('SET "email_hash" = "email_hmac"');
  });

  it('down bloquea sin flag si hay altas posteriores sin SHA-256', async () => {
    delete process.env[FLAG];
    const { runner, queries } = queryRunnerStub(0, 3);

    await expect(new PlatformUsersEmailHmac1784419209000().down(runner as never)).rejects.toThrow(
      new RegExp(`3 platform_user\\(s\\).*${FLAG}=true`, 's'),
    );

    expect(queries.join(' ')).not.toContain('ALTER COLUMN');
  });

  it('down con flag degrada las filas huérfanas al digest HMAC', async () => {
    process.env[FLAG] = 'true';
    const { runner, queries } = queryRunnerStub(0, 3);

    await new PlatformUsersEmailHmac1784419209000().down(runner as never);

    expect(queries.join(' ')).toContain('SET "email_hash" = "email_hmac"');
  });
});
