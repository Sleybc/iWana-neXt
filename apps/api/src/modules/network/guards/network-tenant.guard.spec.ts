import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { TenantContext } from '@iwana/db';
import { NetworkTenantGuard } from './network-tenant.guard';

describe('NetworkTenantGuard', () => {
  afterEach(() => jest.restoreAllMocks());

  it('preserva el 401 sin emitir un código fuera del contrato de red', () => {
    jest.spyOn(TenantContext, 'get').mockReturnValue(undefined);
    const context = {
      switchToHttp: () => ({ getRequest: () => ({ user: undefined }) }),
    } as unknown as ExecutionContext;

    try {
      new NetworkTenantGuard().canActivate(context);
      throw new Error('Se esperaba UnauthorizedException');
    } catch (error) {
      expect(error).toBeInstanceOf(UnauthorizedException);
      const unauthorized = error as UnauthorizedException;
      expect(unauthorized.getStatus()).toBe(401);
      expect(unauthorized.getResponse()).toEqual({
        message: 'Se requiere un contexto de empresa autenticado.',
      });
    }
  });

  it('responde 401 cuando hay claims de tenant pero falta el contexto resuelto', () => {
    jest.spyOn(TenantContext, 'get').mockReturnValue(undefined);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            type: 'tenant',
            tenantId: 'tenant-a',
            schemaName: 'tenant_a',
          },
        }),
      }),
    } as unknown as ExecutionContext;

    expect(() => new NetworkTenantGuard().canActivate(context)).toThrow(UnauthorizedException);
  });

  it('responde 403 cuando los claims autenticados pertenecen a otro tenant/schema', () => {
    jest.spyOn(TenantContext, 'get').mockReturnValue({
      tenantId: 'tenant-context-a',
      tenantSlug: 'tenant-context-a',
      schemaName: 'tenant_context_a',
    });
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            type: 'tenant',
            tenantId: 'tenant-b',
            schemaName: 'tenant_b',
          },
        }),
      }),
    } as unknown as ExecutionContext;

    try {
      new NetworkTenantGuard().canActivate(context);
      throw new Error('Se esperaba ForbiddenException');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException);
      const forbidden = error as ForbiddenException;
      expect(forbidden.getStatus()).toBe(403);
      expect(forbidden.getResponse()).toEqual({
        code: 'FORBIDDEN',
        message: 'El contexto de empresa no corresponde a las credenciales autenticadas.',
      });
    }
  });
});
