import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessPermissionKey, UserRole } from '@iwana/shared';
import { ExecutionOrderAccessGuard } from './execution-order-access.guard';

describe('ExecutionOrderAccessGuard', () => {
  const actor = {
    sub: 'admin-001',
    role: UserRole.ADMIN,
    type: 'tenant',
  } as never;

  const makeContext = (method: string): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          method,
          params: { id: 'order-001' },
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
    expect(service.assertActorAccess).toHaveBeenCalledWith('order-001', actor, true, true);
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
    expect(service.assertActorAccess).toHaveBeenCalledWith('order-001', actor, true, false);
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
    expect(service.assertActorAccess).toHaveBeenCalledWith('order-001', actor, false, false);
  });
});
