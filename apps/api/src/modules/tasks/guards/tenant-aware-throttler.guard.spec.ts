import {
  ExecutionContext,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { TenantContext } from '@iwana/db';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { TenantAwareThrottlerGuard } from './tenant-aware-throttler.guard';

describe('TenantAwareThrottlerGuard', () => {
  it('rechaza antes de Redis cuando falta TenantContext', async () => {
    const redis = { eval: jest.fn() };
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

    const guardWithRedis = new TenantAwareThrottlerGuard(redis as never);

    await expect(guardWithRedis.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(redis.eval).not.toHaveBeenCalled();
    expect(setHeader).not.toHaveBeenCalled();
  });

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

    await TenantContext.run(
      { tenantId: 'tenant-001', schemaName: 'tenant_001', tenantSlug: 'test' },
      async () => {
        await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
          ServiceUnavailableException,
        );
      },
    );
    expect(setHeader).not.toHaveBeenCalled();
  });
});
