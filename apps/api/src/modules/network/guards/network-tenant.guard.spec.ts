import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
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
});
