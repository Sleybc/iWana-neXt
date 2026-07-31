import { AddMediaAssetStatusAndClaim0200000000000 } from './020_add_media_asset_status_and_claim';

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
      return [];
    });

    await expect(
      new AddMediaAssetStatusAndClaim0200000000000().down({ query } as never),
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
      return [];
    });

    await new AddMediaAssetStatusAndClaim0200000000000().down({ query } as never);

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
      return [];
    });

    await new AddMediaAssetStatusAndClaim0200000000000().down({ query } as never);

    const all = queries.join(' ');
    expect(all).toContain(
      'DELETE FROM "public"."media_assets" WHERE "usage" = \'execution_evidence\'',
    );
    expect(all).toContain('ADD CONSTRAINT "chk_media_assets_usage"');
    expect(all).toContain('DROP COLUMN IF EXISTS "asset_status"');
  });
});
