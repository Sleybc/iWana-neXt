import { AddMediaAssetStatusAndClaim1784419208000 } from './020_add_media_asset_status_and_claim';

const FLAG = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

describe('AddMediaAssetStatusAndClaim020', () => {
  const originalFlag = process.env[FLAG];

  afterAll(() => {
    if (originalFlag === undefined) delete process.env[FLAG];
    else process.env[FLAG] = originalFlag;
  });

  it('protege el down ante evidencia y no normaliza usage ni claim_ref', async () => {
    delete process.env[FLAG];
    const queries: string[] = [];
    const query = jest.fn(async (sql: string) => {
      queries.push(sql);
      if (sql.includes('SELECT "id"')) return [{ id: 'asset-test' }];
      if (sql.includes("to_regclass('public.media_assets')")) return [{ present: true }];
      return [];
    });

    await expect(
      new AddMediaAssetStatusAndClaim1784419208000().down({ query } as never),
    ).rejects.toThrow(new RegExp(`${FLAG}=true`));
    const all = queries.join(' ');
    expect(all).not.toMatch(/UPDATE\s+"public"\."media_assets"/i);
    expect(all).toMatch(/usage"\s*=\s*'execution_evidence'/);
    expect(all).toContain('LIMIT 1');
    expect(all).not.toContain('DROP CONSTRAINT');
  });

  it('revierte un estado vacío sin UPDATE destructivo', async () => {
    delete process.env[FLAG];
    const queries: string[] = [];
    const query = jest.fn(async (sql: string) => {
      queries.push(sql);
      if (sql.includes("to_regclass('public.media_assets')")) return [{ present: true }];
      return [];
    });

    await new AddMediaAssetStatusAndClaim1784419208000().down({ query } as never);

    const all = queries.join(' ');
    expect(all).not.toMatch(/UPDATE\s+"public"\."media_assets"/i);
    expect(all).toContain('DROP COLUMN IF EXISTS "claim_ref"');
    expect(all).toContain('DROP COLUMN IF EXISTS "asset_status"');
  });

  it('con flag elimina evidencia incompatible y completa el down', async () => {
    process.env[FLAG] = 'true';
    const queries: string[] = [];
    const query = jest.fn(async (sql: string) => {
      queries.push(sql);
      if (sql.includes("to_regclass('public.media_assets')")) return [{ present: true }];
      return [];
    });

    await new AddMediaAssetStatusAndClaim1784419208000().down({ query } as never);

    const all = queries.join(' ');
    expect(all).toContain(
      'DELETE FROM "public"."media_assets" WHERE "usage" = \'execution_evidence\'',
    );
    expect(all).toContain('ADD CONSTRAINT "chk_media_assets_usage"');
    expect(all).toContain('DROP COLUMN IF EXISTS "asset_status"');
  });

  it('falla cerrado si public.media_assets no existe y no emite DDL alternativo', async () => {
    const queries: string[] = [];
    const query = jest.fn(async (sql: string) => {
      queries.push(sql);
      if (sql.includes("to_regclass('public.media_assets')")) return [{ present: false }];
      return [];
    });

    await expect(
      new AddMediaAssetStatusAndClaim1784419208000().up({ query } as never),
    ).rejects.toThrow(/migración canónica 008_create_media_assets_table/);

    const all = queries.join(' ');
    expect(all).not.toContain('CREATE TABLE');
    expect(all).not.toContain('ALTER TABLE');
  });

  it('también bloquea el down si la tabla canónica desapareció', async () => {
    const queries: string[] = [];
    const query = jest.fn(async (sql: string) => {
      queries.push(sql);
      if (sql.includes("to_regclass('public.media_assets')")) return [{ present: false }];
      return [];
    });

    await expect(
      new AddMediaAssetStatusAndClaim1784419208000().down({ query } as never),
    ).rejects.toThrow(/migración canónica 008_create_media_assets_table/);

    expect(queries.join(' ')).not.toContain('DROP COLUMN');
  });

  it('ordena 020 después de la migración canónica 008 por timestamp TypeORM', () => {
    const timestamp = (name: string): number => Number(name.match(/(\d+)$/)?.[1]);

    expect(timestamp('CreateMediaAssetsTable1746000001000')).toBeLessThan(
      timestamp(new AddMediaAssetStatusAndClaim1784419208000().name),
    );
  });
});
