import { ForbiddenException } from '@nestjs/common';
import { AuditAction, PlatformRole, TenantStatus } from '@iwana/shared';
import { TenantUsageService } from './tenant-usage.service';

describe('TenantUsageService', () => {
  const query = jest.fn();
  const log = jest.fn();
  const getTenantUsageGrantedRoles = jest.fn();
  const service = new TenantUsageService(
    { query } as never,
    { log } as never,
    { getTenantUsageGrantedRoles } as never,
  );

  beforeEach(() => getTenantUsageGrantedRoles.mockResolvedValue([]));
  afterEach(() => jest.clearAllMocks());

  it('mapea la medición, deja null sin medición y solo lee empresas ACTIVE', async () => {
    query.mockResolvedValueOnce([
      {
        tenant_id: 'a',
        name: 'Alfa',
        active_subscribers: 12,
        max_subscribers: 20,
        measured_at: new Date('2026-11-21T10:00:00Z'),
      },
      {
        tenant_id: 'b',
        name: 'Beta',
        active_subscribers: null,
        max_subscribers: null,
        measured_at: null,
      },
    ]);

    const usage = await service.getUsage({
      userId: 'u1',
      role: PlatformRole.SYSTEM_ADMIN,
      ipAddress: '10.0.0.1',
    });

    expect(query.mock.calls[0]?.[1]).toEqual([TenantStatus.ACTIVE]);
    expect(query.mock.calls[0]?.[0]).not.toMatch(/tenant_[a-z]+\./u);
    expect(usage.items).toEqual([
      {
        tenantId: 'a',
        name: 'Alfa',
        activeSubscribers: 12,
        maxSubscribers: 20,
        measuredAt: '2026-11-21T10:00:00.000Z',
      },
      {
        tenantId: 'b',
        name: 'Beta',
        activeSubscribers: null,
        maxSubscribers: null,
        measuredAt: null,
      },
    ]);
    expect(typeof usage.generatedAt).toBe('string');
  });

  it('audita LIST_ACCESS con actor, IP y cantidad, sin datos de empresa', async () => {
    query.mockResolvedValueOnce([]);
    await service.getUsage({ userId: 'u1', role: PlatformRole.SYSTEM_ADMIN, ipAddress: null });
    expect(log).toHaveBeenCalledWith({
      action: AuditAction.LIST_ACCESS,
      entityType: 'TenantUsage',
      entityId: 'N/A',
      userId: 'u1',
      ipAddress: null,
      newValue: { tenantsReturned: 0 },
    });
  });

  describe('visibilidad por rol (ADR-114 v1.3 §9)', () => {
    it('soporte sin concesión recibe 403 sin consultar ni auditar', async () => {
      await expect(
        service.getUsage({ userId: 'u2', role: PlatformRole.IWANA_SUPPORT, ipAddress: null }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(query).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
    });

    it('lee el ajuste en cada petición: concedido ve, retirado deja de ver', async () => {
      query.mockResolvedValue([]);
      getTenantUsageGrantedRoles.mockResolvedValueOnce([PlatformRole.IWANA_SUPPORT]);
      await service.getUsage({ userId: 'u2', role: PlatformRole.IWANA_SUPPORT, ipAddress: null });
      getTenantUsageGrantedRoles.mockResolvedValueOnce([]);
      await expect(
        service.getUsage({ userId: 'u2', role: PlatformRole.IWANA_SUPPORT, ipAddress: null }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(getTenantUsageGrantedRoles).toHaveBeenCalledTimes(2);
    });

    it('un rol de empresa nunca ve, aunque el ajuste tenga concesiones', async () => {
      getTenantUsageGrantedRoles.mockResolvedValueOnce([PlatformRole.IWANA_SUPPORT]);
      await expect(
        service.getUsage({ userId: 'u3', role: 'ADMIN', ipAddress: null }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('getVisibility devuelve el ajuste y canView del rol', async () => {
      await expect(service.getVisibility(PlatformRole.SYSTEM_ADMIN)).resolves.toEqual({
        grantedRoles: [],
        canView: true,
      });
      await expect(service.getVisibility(PlatformRole.IWANA_SUPPORT)).resolves.toEqual({
        grantedRoles: [],
        canView: false,
      });
    });
  });
});
