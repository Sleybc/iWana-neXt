import { TenantContext } from '@iwana/db';
import { getGlobalRateLimitTracker } from './rate-limit-tracker';

describe('getGlobalRateLimitTracker', () => {
  it('usa tenant y hash SHA-256 del bearer sin exponer el valor original', async () => {
    const bearerValue = ['opaque', 'auth', 'value'].join('-');

    await TenantContext.run(
      { tenantId: 'tenant-a', schemaName: 'tenant_a', tenantSlug: 'tenant-a' },
      async () => {
        const tracker = getGlobalRateLimitTracker({
          headers: { authorization: `Bearer ${bearerValue}` },
          ip: '198.51.100.10',
          iwanaTenantResolutionSource: 'jwt-verified',
        });

        expect(tracker).toMatch(/^tenant-a:bearer:[a-f0-9]{64}$/);
        expect(tracker).not.toContain(bearerValue);
      },
    );
  });

  it('usa bucket tenant para cookie y solo IP para peticiones anónimas', async () => {
    await TenantContext.run(
      { tenantId: 'tenant-a', schemaName: 'tenant_a', tenantSlug: 'tenant-a' },
      async () => {
        expect(
          getGlobalRateLimitTracker({
            ip: '198.51.100.10',
            iwanaTenantResolutionSource: 'jwt-verified',
          }),
        ).toBe('tenant-a:tenant');
      },
    );

    expect(getGlobalRateLimitTracker({ ip: '198.51.100.10' })).toBe('anonymous:ip:198.51.100.10');
  });

  it('agrupa bearers no verificables por IP cuando no existe contexto tenant', () => {
    const first = getGlobalRateLimitTracker({
      headers: {
        authorization: 'Bearer opaque-auth-one',
        'x-tenant-slug': 'tenant-publico',
      },
      ip: '198.51.100.10',
      iwanaTenantResolutionSource: 'public-header',
    });
    const second = getGlobalRateLimitTracker({
      headers: {
        authorization: 'Bearer opaque-auth-two',
        'x-tenant-slug': 'tenant-publico',
      },
      ip: '198.51.100.10',
      iwanaTenantResolutionSource: 'public-header',
    });

    expect(first).toBe('anonymous:ip:198.51.100.10');
    expect(second).toBe(first);
  });
});
