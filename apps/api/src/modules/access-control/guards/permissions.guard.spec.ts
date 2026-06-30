import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessPermissionKey, UserRole } from '@iwana/shared';
import { PermissionsGuard } from './permissions.guard';
import { EffectivePermissionsService } from '../services/effective-permissions.service';

function buildExecutionContext(
  user?: {
    sub: string;
    role: UserRole;
    type?: 'tenant' | 'platform';
  },
  requestOverrides?: { params?: Record<string, string>; body?: Record<string, unknown> },
) {
  return {
    getHandler: () => ({ name: 'handler' }),
    getClass: () => ({ name: 'controller' }),
    switchToHttp: () => ({
      getRequest: () => ({
        user,
        params: requestOverrides?.params ?? {},
        body: requestOverrides?.body ?? {},
      }),
    }),
  } as any;
}

describe('PermissionsGuard', () => {
  it('permite el acceso cuando no hay metadata de permisos', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const effectivePermissionsService = {
      getEffectivePermissionsForUser: jest.fn(),
    } as unknown as EffectivePermissionsService;

    const guard = new PermissionsGuard(reflector, effectivePermissionsService);

    await expect(
      guard.canActivate(buildExecutionContext({ sub: 'usr-1', role: UserRole.ADMIN })),
    ).resolves.toBe(true);
    expect(effectivePermissionsService.getEffectivePermissionsForUser).not.toHaveBeenCalled();
  });

  it('rechaza al usuario sin el permiso granular requerido', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([AccessPermissionKey.ACCESS_PROFILES_MANAGE]),
    } as unknown as Reflector;
    const effectivePermissionsService = {
      getEffectivePermissionsForUser: jest
        .fn()
        .mockResolvedValue([AccessPermissionKey.SETTINGS_READ]),
    } as unknown as EffectivePermissionsService;

    const guard = new PermissionsGuard(reflector, effectivePermissionsService);

    await expect(
      guard.canActivate(buildExecutionContext({ sub: 'usr-2', role: UserRole.ADMIN })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('permite al usuario cuando todos los permisos requeridos estan presentes', async () => {
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValue([
          AccessPermissionKey.SETTINGS_READ,
          AccessPermissionKey.ACCESS_PROFILES_MANAGE,
        ]),
    } as unknown as Reflector;
    const effectivePermissionsService = {
      getEffectivePermissionsForUser: jest
        .fn()
        .mockResolvedValue([
          AccessPermissionKey.SETTINGS_READ,
          AccessPermissionKey.ACCESS_PROFILES_MANAGE,
        ]),
    } as unknown as EffectivePermissionsService;

    const guard = new PermissionsGuard(reflector, effectivePermissionsService);

    await expect(
      guard.canActivate(buildExecutionContext({ sub: 'usr-3', role: UserRole.ADMIN })),
    ).resolves.toBe(true);
  });

  it('omite el chequeo granular para usuarios de plataforma', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([AccessPermissionKey.USERS_MANAGE]),
    } as unknown as Reflector;
    const effectivePermissionsService = {
      getEffectivePermissionsForUser: jest.fn(),
    } as unknown as EffectivePermissionsService;

    const guard = new PermissionsGuard(reflector, effectivePermissionsService);

    await expect(
      guard.canActivate(
        buildExecutionContext({
          sub: 'usr-platform',
          role: UserRole.SYSTEM_ADMIN,
          type: 'platform',
        }),
      ),
    ).resolves.toBe(true);
    expect(effectivePermissionsService.getEffectivePermissionsForUser).not.toHaveBeenCalled();
  });

  it('propaga siteId al resolver permisos efectivos cuando la ruta es site-scoped', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([AccessPermissionKey.ORGANIZATION_SITES_MANAGE]),
    } as unknown as Reflector;
    const effectivePermissionsService = {
      getEffectivePermissionsForUser: jest
        .fn()
        .mockResolvedValue([AccessPermissionKey.ORGANIZATION_SITES_MANAGE]),
    } as unknown as EffectivePermissionsService;

    const guard = new PermissionsGuard(reflector, effectivePermissionsService);

    await expect(
      guard.canActivate(
        buildExecutionContext(
          { sub: 'usr-site-admin', role: UserRole.ADMIN, type: 'tenant' },
          { params: { siteId: 'site-norte' } },
        ),
      ),
    ).resolves.toBe(true);
    expect(effectivePermissionsService.getEffectivePermissionsForUser).toHaveBeenCalledWith(
      'usr-site-admin',
      'site-norte',
    );
  });
});
