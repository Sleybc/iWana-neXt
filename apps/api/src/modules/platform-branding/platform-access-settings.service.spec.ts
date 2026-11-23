import { AuditAction, PlatformRole } from '@iwana/shared';
import { PlatformAccessSettingsService } from './platform-access-settings.service';

describe('PlatformAccessSettingsService (ADR-114 v1.3 §9)', () => {
  const findOne = jest.fn();
  const txQuery = jest.fn();
  const manager = { query: txQuery };
  const transaction = jest.fn(async (work: (m: typeof manager) => Promise<unknown>) =>
    work(manager),
  );
  const logWithin = jest.fn();
  const service = new PlatformAccessSettingsService(
    { findOne, manager: { transaction } } as never,
    { logWithin } as never,
  );

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

  it('bloquea la fila, guarda y audita en la misma transacción con el valor bloqueado', async () => {
    txQuery
      .mockResolvedValueOnce([]) // SET LOCAL lock_timeout
      .mockResolvedValueOnce([]) // INSERT … ON CONFLICT DO NOTHING
      .mockResolvedValueOnce([{ roles: [] }]) // SELECT … FOR UPDATE
      .mockResolvedValueOnce([]); // UPDATE
    await service.setTenantUsageGrantedRoles([PlatformRole.IWANA_SUPPORT], {
      userId: 'admin-1',
      ipAddress: '10.0.0.9',
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(txQuery.mock.calls[0]?.[0]).toMatch(/lock_timeout/u);
    expect(txQuery.mock.calls[2]?.[0]).toMatch(/FOR UPDATE/u);
    expect(txQuery.mock.calls[3]?.[1]).toEqual(['platform', [PlatformRole.IWANA_SUPPORT]]);
    expect(findOne).not.toHaveBeenCalled();
    expect(logWithin).toHaveBeenCalledWith(
      {
        action: AuditAction.UPDATE,
        entityType: 'TenantUsageVisibility',
        entityId: 'platform',
        userId: 'admin-1',
        ipAddress: '10.0.0.9',
        oldValue: { grantedRoles: [] },
        newValue: { grantedRoles: [PlatformRole.IWANA_SUPPORT] },
      },
      manager,
    );
  });

  it('si la auditoría falla, el error se propaga y la transacción se revierte', async () => {
    txQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ roles: [] }])
      .mockResolvedValueOnce([]);
    logWithin.mockRejectedValueOnce(new Error('audit down'));
    await expect(
      service.setTenantUsageGrantedRoles([], { userId: 'a', ipAddress: null }),
    ).rejects.toThrow('audit down');
  });
});
