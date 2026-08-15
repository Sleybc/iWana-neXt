import { DataSource } from 'typeorm';
import { UserStatus } from '@iwana/shared';
import { SettingsPriorityUsersReadAdapter } from './settings-priority-users-read.adapter';

const mockRunInTenantSchema = jest.fn();

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    runInTenantSchema: (...args: Parameters<typeof mockRunInTenantSchema>) =>
      mockRunInTenantSchema(...args),
  };
});

describe('SettingsPriorityUsersReadAdapter', () => {
  const adapter = new SettingsPriorityUsersReadAdapter({} as DataSource);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('cuenta usuarios ACTIVE y el subconjunto con MFA dentro del schema recibido', async () => {
    const count = jest.fn().mockResolvedValueOnce(4).mockResolvedValueOnce(3);
    mockRunInTenantSchema.mockImplementation(async (_dataSource, _schemaName, callback) =>
      callback({ manager: { getRepository: () => ({ count }) } }),
    );

    const result = await adapter.getSnapshot({
      tenantId: '11111111-1111-4111-8111-111111111111',
      schemaName: 'tenant_demo',
    });

    expect(mockRunInTenantSchema).toHaveBeenCalledWith(
      expect.anything(),
      'tenant_demo',
      expect.any(Function),
    );
    expect(count).toHaveBeenNthCalledWith(1, {
      where: {
        tenantId: '11111111-1111-4111-8111-111111111111',
        status: UserStatus.ACTIVE,
      },
    });
    expect(count).toHaveBeenNthCalledWith(2, {
      where: {
        tenantId: '11111111-1111-4111-8111-111111111111',
        status: UserStatus.ACTIVE,
        mfaEnabled: true,
      },
    });
    expect(result).toEqual({ activeUsers: 4, mfaEnabledActiveUsers: 3 });
  });
});
