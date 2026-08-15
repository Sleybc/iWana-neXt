import {
  SettingsPriorityEvaluation,
  SettingsPriorityKey,
  SettingsPrioritySource,
  SettingsPriorityState,
} from '@iwana/shared';
import { SettingsPriorityTenantReadPort } from '../../tenant/ports/settings-priority-tenant-read.port';
import { SettingsPriorityUsersReadPort } from '../../users/ports/settings-priority-users-read.port';
import { SettingsPriorityOrganizationReadPort } from '../../organization/ports/settings-priority-organization-read.port';
import { SettingsPriorityService } from './settings-priority.service';

describe('SettingsPriorityService', () => {
  const tenantPort = {
    getSnapshot: jest.fn(),
  } as jest.Mocked<SettingsPriorityTenantReadPort>;
  const usersPort = {
    getSnapshot: jest.fn(),
  } as jest.Mocked<SettingsPriorityUsersReadPort>;
  const organizationPort = {
    getSnapshot: jest.fn(),
  } as jest.Mocked<SettingsPriorityOrganizationReadPort>;

  const service = new SettingsPriorityService(tenantPort, usersPort, organizationPort);

  beforeEach(() => {
    jest.clearAllMocks();
    tenantPort.getSnapshot.mockResolvedValue({
      mfaRequiredAll: true,
      brandingCustomized: true,
    });
    usersPort.getSnapshot.mockResolvedValue({
      activeUsers: 2,
      mfaEnabledActiveUsers: 2,
    });
    organizationPort.getSnapshot.mockResolvedValue({
      activeOrganizationSites: 1,
      validOpenCompanyDays: 5,
    });
  });

  it('consulta los tres owners con contexto verificado y retorna NONE si todo está listo', async () => {
    const result = await service.getPriority({
      tenantId: '11111111-1111-4111-8111-111111111111',
      schemaName: 'tenant_demo',
    });

    expect(tenantPort.getSnapshot).toHaveBeenCalledWith({
      tenantId: '11111111-1111-4111-8111-111111111111',
    });
    expect(usersPort.getSnapshot).toHaveBeenCalledWith({
      tenantId: '11111111-1111-4111-8111-111111111111',
      schemaName: 'tenant_demo',
    });
    expect(organizationPort.getSnapshot).toHaveBeenCalledWith({
      tenantId: '11111111-1111-4111-8111-111111111111',
      schemaName: 'tenant_demo',
    });
    expect(result.state).toBe(SettingsPriorityState.NONE);
  });

  it('degrada solo la fuente fallida sin exponer su excepción', async () => {
    usersPort.getSnapshot.mockRejectedValue(new Error('detalle interno sensible'));
    organizationPort.getSnapshot.mockResolvedValue({
      activeOrganizationSites: 0,
      validOpenCompanyDays: 0,
    });

    const result = await service.getPriority({
      tenantId: '11111111-1111-4111-8111-111111111111',
      schemaName: 'tenant_demo',
    });

    expect(result).toEqual(
      expect.objectContaining({
        state: SettingsPriorityState.ACTION_REQUIRED,
        evaluation: SettingsPriorityEvaluation.PARTIAL,
        unknownSources: [SettingsPrioritySource.USERS],
        item: expect.objectContaining({
          key: SettingsPriorityKey.NO_ACTIVE_ORGANIZATION_SITE,
        }),
      }),
    );
    expect(JSON.stringify(result)).not.toContain('detalle interno sensible');
  });

  it('mantiene el orden estable TENANT, USERS, ORGANIZATION en fuentes desconocidas', async () => {
    tenantPort.getSnapshot.mockRejectedValue(new Error('tenant'));
    usersPort.getSnapshot.mockRejectedValue(new Error('users'));
    organizationPort.getSnapshot.mockRejectedValue(new Error('organization'));

    const result = await service.getPriority({
      tenantId: '11111111-1111-4111-8111-111111111111',
      schemaName: 'tenant_demo',
    });

    expect(result).toEqual({
      state: SettingsPriorityState.UNKNOWN,
      item: null,
      evaluation: SettingsPriorityEvaluation.PARTIAL,
      unknownSources: [
        SettingsPrioritySource.TENANT,
        SettingsPrioritySource.USERS,
        SettingsPrioritySource.ORGANIZATION,
      ],
    });
  });
});
