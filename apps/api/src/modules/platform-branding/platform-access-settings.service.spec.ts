import { AuditAction, PlatformRole } from '@iwana/shared';
import { PlatformAccessSettingsService } from './platform-access-settings.service';

describe('PlatformAccessSettingsService (ADR-114 v1.3 §9)', () => {
  const findOne = jest.fn();
  const query = jest.fn();
  const log = jest.fn();
  const service = new PlatformAccessSettingsService({ findOne, query } as never, { log } as never);

  afterEach(() => jest.clearAllMocks());

  it('sin fila o con lista vacía, nadie más que el administrador', async () => {
    findOne.mockResolvedValueOnce(null);
    await expect(service.getTenantUsageGrantedRoles()).resolves.toEqual([]);
  });

  it('descarta valores que no son roles autorizables', async () => {
    findOne.mockResolvedValueOnce({
      tenantUsageViewerRoles: ['SYSTEM_ADMIN', 'IWANA_SUPPORT', 'X'],
    });
    await expect(service.getTenantUsageGrantedRoles()).resolves.toEqual([
      PlatformRole.IWANA_SUPPORT,
    ]);
  });

  it('guarda y audita UPDATE con valor anterior y nuevo, actor e IP', async () => {
    findOne.mockResolvedValueOnce({ tenantUsageViewerRoles: [] });
    await service.setTenantUsageGrantedRoles([PlatformRole.IWANA_SUPPORT], {
      userId: 'admin-1',
      ipAddress: '10.0.0.9',
    });
    expect(query.mock.calls[0]?.[1]).toEqual(['platform', [PlatformRole.IWANA_SUPPORT]]);
    expect(log).toHaveBeenCalledWith({
      action: AuditAction.UPDATE,
      entityType: 'TenantUsageVisibility',
      entityId: 'platform',
      userId: 'admin-1',
      ipAddress: '10.0.0.9',
      oldValue: { grantedRoles: [] },
      newValue: { grantedRoles: [PlatformRole.IWANA_SUPPORT] },
    });
  });
});
