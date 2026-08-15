import { DataSource } from 'typeorm';
import { SettingsPriorityOrganizationReadAdapter } from './settings-priority-organization-read.adapter';

const mockRunInTenantSchema = jest.fn();

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    runInTenantSchema: (...args: Parameters<typeof mockRunInTenantSchema>) =>
      mockRunInTenantSchema(...args),
  };
});

describe('SettingsPriorityOrganizationReadAdapter', () => {
  const adapter = new SettingsPriorityOrganizationReadAdapter({} as DataSource);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('cuenta sedes activas y días empresariales abiertos válidos en una transacción tenant', async () => {
    const siteCount = jest.fn().mockResolvedValue(2);
    const hoursBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(5),
    };
    const getRepository = jest
      .fn()
      .mockReturnValueOnce({ count: siteCount })
      .mockReturnValueOnce({ createQueryBuilder: jest.fn().mockReturnValue(hoursBuilder) });

    mockRunInTenantSchema.mockImplementation(async (_dataSource, _schemaName, callback) =>
      callback({ manager: { getRepository } }),
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
    expect(siteCount).toHaveBeenCalledWith({
      where: {
        tenantId: '11111111-1111-4111-8111-111111111111',
        isActive: true,
      },
    });
    expect(hoursBuilder.where).toHaveBeenCalledWith('hours.tenantId = :tenantId', {
      tenantId: '11111111-1111-4111-8111-111111111111',
    });
    expect(hoursBuilder.andWhere).toHaveBeenCalledWith('hours.isOpen = :isOpen', {
      isOpen: true,
    });
    expect(hoursBuilder.andWhere).toHaveBeenCalledWith('hours.opensAt IS NOT NULL');
    expect(hoursBuilder.andWhere).toHaveBeenCalledWith('hours.closesAt IS NOT NULL');
    expect(hoursBuilder.andWhere).toHaveBeenCalledWith('hours.opensAt < hours.closesAt');
    expect(result).toEqual({ activeOrganizationSites: 2, validOpenCompanyDays: 5 });
  });
});
