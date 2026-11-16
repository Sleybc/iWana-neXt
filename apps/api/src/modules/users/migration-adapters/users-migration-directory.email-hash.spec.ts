import { MIGRATION_IMPORTABLE_USER_ROLES } from '@iwana/shared';
import { UsersMigrationDirectoryAdapter } from './users-migration-directory.adapter';

describe('UsersMigrationDirectoryAdapter.findUserIdsByEmailHash', () => {
  const tenantId = '69000000-0000-4000-8000-000000000001';

  it('no consulta sin hashes', async () => {
    const query = jest.fn();
    const result = await new UsersMigrationDirectoryAdapter().findUserIdsByEmailHash(
      { manager: { query } as never, tenantId },
      [],
    );
    expect(result.size).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });

  it('filtra por tenant, deduplica y excluye borrados', async () => {
    const query = jest.fn().mockResolvedValue([{ id: 'u-1', email_hmac: 'h1' }]);
    const result = await new UsersMigrationDirectoryAdapter().findUserIdsByEmailHash(
      { manager: { query } as never, tenantId },
      ['h1', 'h1', 'h2'],
    );
    expect(result).toEqual(new Map([['h1', 'u-1']]));
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/tenant_id = \$1/u);
    expect(sql).toMatch(/deleted_at IS NULL/u);
    // S-5: un suscriptor, socio o inversionista con el mismo correo nunca se propone enlazar.
    expect(sql).toMatch(/role = ANY\(\$3::varchar\[\]\)/u);
    expect(params).toEqual([tenantId, ['h1', 'h2'], [...MIGRATION_IMPORTABLE_USER_ROLES]]);
  });
});
