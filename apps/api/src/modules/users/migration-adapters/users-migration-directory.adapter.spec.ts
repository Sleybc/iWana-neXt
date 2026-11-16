import { MIGRATION_IMPORTABLE_USER_ROLES } from '@iwana/shared';
import { UsersMigrationDirectoryAdapter } from './users-migration-directory.adapter';

const TENANT = '66666666-6666-4666-8666-666666666666';
const ANA = '11111111-1111-4111-8111-111111111111';

describe('UsersMigrationDirectoryAdapter', () => {
  it('consulta solo UUID válidos del tenant, sin borrados, y devuelve ids', async () => {
    const query = jest.fn().mockResolvedValue([{ id: ANA }]);
    const result = await new UsersMigrationDirectoryAdapter().existingUserIds(
      { manager: { query } as never, tenantId: TENANT },
      [ANA.toUpperCase(), ANA, 'no-es-uuid'],
    );
    expect(result).toEqual(new Set([ANA]));
    const [sql, params] = query.mock.calls[0]!;
    expect(sql).toContain('deleted_at IS NULL');
    expect(sql).toContain('tenant_id = $1');
    // S-5: solo personal importable; nunca SUBSCRIBER, PARTNER ni INVESTOR.
    expect(sql).toContain('role = ANY($3::varchar[])');
    expect(params).toEqual([TENANT, [ANA], [...MIGRATION_IMPORTABLE_USER_ROLES]]);
    expect(params[2]).not.toEqual(expect.arrayContaining(['SUBSCRIBER']));
  });

  it('sin ids válidos no consulta', async () => {
    const query = jest.fn();
    const result = await new UsersMigrationDirectoryAdapter().existingUserIds(
      { manager: { query } as never, tenantId: TENANT },
      ['x'],
    );
    expect(result.size).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });
});
