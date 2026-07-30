import { ExecutionContext, ServiceUnavailableException } from '@nestjs/common';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { TenantAwareThrottlerGuard } from './tenant-aware-throttler.guard';

describe('TenantAwareThrottlerGuard', () => {
  it('devuelve 503 en una mutación cuando el harness no registra Redis', async () => {
    const guard = new TenantAwareThrottlerGuard(undefined);
    const setHeader = jest.fn();
    const request = {
      method: 'POST',
      url: '/tasks/execution-orders/order-001/start',
      user: {
        sub: 'actor-001',
        email: 'hash',
        role: 'TECHNICIAN',
        tenantId: 'tenant-001',
        schemaName: 'tenant_001',
        jti: 'jti-001',
        type: 'tenant',
      } as JwtPayload,
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ setHeader }),
      }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(setHeader).not.toHaveBeenCalled();
  });
});
