import { TenantUsageViewerRoles1784419225000 } from './037_tenant_usage_viewer_roles';
import { PlatformUserMfaAttempts1784419226000 } from './038_platform_user_mfa_attempts';
import { PUBLIC_MIGRATIONS } from './index';

describe('038_platform_user_mfa_attempts', () => {
  it('queda registrada inmediatamente después de la 037', () => {
    const index = PUBLIC_MIGRATIONS.indexOf(PlatformUserMfaAttempts1784419226000);
    expect(PUBLIC_MIGRATIONS[index - 1]).toBe(TenantUsageViewerRoles1784419225000);
  });

  it('up y down son simétricos', async () => {
    const columns = async (direction: 'up' | 'down'): Promise<string[]> => {
      const query = jest.fn().mockResolvedValue([]);
      await new PlatformUserMfaAttempts1784419226000()[direction]({ query } as never);
      const sql = query.mock.calls.map(([statement]) => String(statement)).join(' ');
      return [...sql.matchAll(/(?:ADD|DROP) COLUMN "(\w+)"/gu)].map((match) => match[1]!).sort();
    };
    expect(await columns('down')).toEqual(await columns('up'));
  });
});
