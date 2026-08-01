import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessPermissionKey, UserRole } from '@iwana/shared';
import { ExecutionOrderAccessGuard } from './execution-order-access.guard';
import { EXECUTION_ORDER_TENANT_SCOPED_KEY } from './execution-order-tenant-scoped.decorator';

describe('ExecutionOrderAccessGuard', () => {
  const actor = {
    sub: 'admin-001',
    role: UserRole.ADMIN,
    type: 'tenant',
  } as never;

  const makeContext = (
    method: string,
    params: Record<string, string> = { id: 'order-001' },
  ): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          method,
          params,
          user: actor,
        }),
      }),
    }) as unknown as ExecutionContext;

  it('marks execute routes as technical execution', async () => {
    const service = { assertActorAccess: jest.fn().mockResolvedValue(undefined) };
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValue([AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_EXECUTE]),
    } as unknown as Reflector;
    const guard = new ExecutionOrderAccessGuard(service as never, reflector);

    await expect(guard.canActivate(makeContext('POST'))).resolves.toBe(true);
    expect(service.assertActorAccess).toHaveBeenCalledWith('order-001', actor, true, true, false);
  });

  it('keeps supervise writes distinct from technical execution', async () => {
    const service = { assertActorAccess: jest.fn().mockResolvedValue(undefined) };
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValue([AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_SUPERVISE]),
    } as unknown as Reflector;
    const guard = new ExecutionOrderAccessGuard(service as never, reflector);

    await expect(guard.canActivate(makeContext('POST'))).resolves.toBe(true);
    expect(service.assertActorAccess).toHaveBeenCalledWith('order-001', actor, true, false, true);
  });

  it('does not classify supervisor reads as technical execution', async () => {
    const service = { assertActorAccess: jest.fn().mockResolvedValue(undefined) };
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValue([AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ]),
    } as unknown as Reflector;
    const guard = new ExecutionOrderAccessGuard(service as never, reflector);

    await expect(guard.canActivate(makeContext('GET'))).resolves.toBe(true);
    expect(service.assertActorAccess).toHaveBeenCalledWith('order-001', actor, false, false, false);
  });

  it('revalidates redrive against the resource instead of returning true automatically', async () => {
    const service = {
      assertActorCanRedrive: jest.fn().mockResolvedValue(undefined),
    };
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValue([AccessPermissionKey.OPERATIONS_EXECUTION_EVENTS_REDRIVE]),
    } as unknown as Reflector;
    const guard = new ExecutionOrderAccessGuard(service as never, reflector);
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          params: { eventId: 'event-001' },
          user: actor,
        }),
      }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(service.assertActorCanRedrive).toHaveBeenCalledWith('event-001', actor);
  });

  it('deniega sin actor sin consultar el servicio', async () => {
    const service = { assertActorAccess: jest.fn() };
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const guard = new ExecutionOrderAccessGuard(service as never, reflector);
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ method: 'GET', params: { id: 'order-001' } }),
      }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).resolves.toBe(false);
    expect(service.assertActorAccess).not.toHaveBeenCalled();
  });

  it('deniega con 403 rutas sin id ni eventId sin metadata tenant-scoped', async () => {
    const service = { assertActorAccess: jest.fn(), assertActorCanRedrive: jest.fn() };
    const reflector = {
      getAllAndOverride: jest.fn().mockImplementation((key: string) => {
        if (key === EXECUTION_ORDER_TENANT_SCOPED_KEY) return undefined;
        return [AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ];
      }),
    } as unknown as Reflector;
    const guard = new ExecutionOrderAccessGuard(service as never, reflector);

    await expect(guard.canActivate(makeContext('GET', {}))).rejects.toThrow(ForbiddenException);
    expect(service.assertActorAccess).not.toHaveBeenCalled();
    expect(service.assertActorCanRedrive).not.toHaveBeenCalled();
  });

  it('permite rutas sin recurso marcadas con metadata tenant-scoped', async () => {
    const service = { assertActorAccess: jest.fn(), assertActorCanRedrive: jest.fn() };
    const reflector = {
      getAllAndOverride: jest.fn().mockImplementation((key: string) => {
        if (key === EXECUTION_ORDER_TENANT_SCOPED_KEY) return true;
        return [AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ];
      }),
    } as unknown as Reflector;
    const guard = new ExecutionOrderAccessGuard(service as never, reflector);

    await expect(guard.canActivate(makeContext('GET', {}))).resolves.toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      EXECUTION_ORDER_TENANT_SCOPED_KEY,
      expect.anything(),
    );
    expect(service.assertActorAccess).not.toHaveBeenCalled();
    expect(service.assertActorCanRedrive).not.toHaveBeenCalled();
  });

  it('no lanza errores internos al resolver metadata ausente en rutas sin recurso', async () => {
    const service = { assertActorAccess: jest.fn(), assertActorCanRedrive: jest.fn() };
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const guard = new ExecutionOrderAccessGuard(service as never, reflector);

    // La metadata ausente debe traducirse en ForbiddenException controlada,
    // nunca en un TypeError ni otra excepción no mapeada.
    await expect(guard.canActivate(makeContext('GET', {}))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
