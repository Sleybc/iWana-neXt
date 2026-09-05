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

  it('P-09: usa bucket por sub verificado para sesiones de cookie', async () => {
    await TenantContext.run(
      { tenantId: 'tenant-a', schemaName: 'tenant_a', tenantSlug: 'tenant-a' },
      async () => {
        const first = getGlobalRateLimitTracker({
          ip: '198.51.100.10',
          iwanaTenantResolutionSource: 'jwt-verified',
          iwanaVerifiedSub: 'user-uuid-1',
        });
        const second = getGlobalRateLimitTracker({
          ip: '198.51.100.10',
          iwanaTenantResolutionSource: 'jwt-verified',
          iwanaVerifiedSub: 'user-uuid-2',
        });

        expect(first).toBe('tenant-a:sub:user-uuid-1');
        // Dos sujetos distintos ya no comparten la cuota de la empresa.
        expect(second).toBe('tenant-a:sub:user-uuid-2');
      },
    );
  });

  it('P-09: conserva el bucket anterior cuando no hay sub verificado', async () => {
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
  });
});
