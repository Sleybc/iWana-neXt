import { AuditAction, TenantStatus } from '@iwana/shared';
import { TenantUsageService } from './tenant-usage.service';

describe('TenantUsageService', () => {
  const query = jest.fn();
  const log = jest.fn();
  const service = new TenantUsageService({ query } as never, { log } as never);

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

    const usage = await service.getUsage({ userId: 'u1', ipAddress: '10.0.0.1' });

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
    await service.getUsage({ userId: 'u1', ipAddress: null });
    expect(log).toHaveBeenCalledWith({
      action: AuditAction.LIST_ACCESS,
      entityType: 'TenantUsage',
      entityId: 'N/A',
      userId: 'u1',
      ipAddress: null,
      newValue: { tenantsReturned: 0 },
    });
  });
});
