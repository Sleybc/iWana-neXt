import { ForbiddenException } from '@nestjs/common';
import {
  AccessProfile,
  AccessProfilePermission,
  TenantContext,
  User,
  UserAccessProfile,
  runInTenantSchema,
} from '@iwana/db';
import { AccessPermissionKey, UserRole } from '@iwana/shared';
import type { DataSource } from 'typeorm';
import { EffectivePermissionScopeAdapter } from './effective-permission-scope.adapter';

jest.mock('@iwana/db', () => ({
  ...jest.requireActual('@iwana/db'),
  TenantContext: {
    ...jest.requireActual('@iwana/db').TenantContext,
    getOrThrow: jest.fn(),
  },
  runInTenantSchema: jest.fn(),
}));

const runInTenant = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;
const getEffectivePermissionsForUser = jest.fn();
const tenant = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  tenantSlug: 'permission-scope-test',
  schemaName: 'tenant_permission_scope_test',
};

describe('EffectivePermissionScopeAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(TenantContext, 'getOrThrow').mockReturnValue(tenant);
  });

  afterEach(() => jest.restoreAllMocks());

  it('permite la acción efectiva y diferencia falta de acción de falta de scope dentro de la familia', async () => {
    const adapter = new EffectivePermissionScopeAdapter(
      {} as DataSource,
      { getEffectivePermissionsForUser } as never,
    );
    getEffectivePermissionsForUser
      .mockResolvedValueOnce([AccessPermissionKey.NETWORK_CATALOG_MANAGE])
      .mockResolvedValueOnce([AccessPermissionKey.NETWORK_CATALOG_READ])
      .mockResolvedValueOnce([]);

    await expect(
      adapter.evaluateSite({
        actorId: 'actor-id',
        siteId: 'persisted-site-id',
        permissionKey: AccessPermissionKey.NETWORK_CATALOG_MANAGE,
      }),
    ).resolves.toBe('ALLOWED');
    await expect(
      adapter.evaluateSite({
        actorId: 'actor-id',
        siteId: 'persisted-site-id',
        permissionKey: AccessPermissionKey.NETWORK_CATALOG_MANAGE,
      }),
    ).resolves.toBe('IN_SCOPE_NO_ACTION');
    await expect(
      adapter.evaluateSite({
        actorId: 'actor-id',
        siteId: 'persisted-site-id',
        permissionKey: AccessPermissionKey.NETWORK_CATALOG_READ,
      }),
    ).resolves.toBe('OUT_OF_SCOPE');

    expect(getEffectivePermissionsForUser).toHaveBeenNthCalledWith(
      1,
      'actor-id',
      'persisted-site-id',
    );
    expect(getEffectivePermissionsForUser).toHaveBeenNthCalledWith(
      2,
      'actor-id',
      'persisted-site-id',
    );
    expect(getEffectivePermissionsForUser).toHaveBeenNthCalledWith(
      3,
      'actor-id',
      'persisted-site-id',
    );
  });

  it('lista únicamente sedes con el permiso efectivo solicitado antes de construir scope', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue({ id: 'actor-id', role: UserRole.NOC }),
      find: jest.fn(async (entity: unknown) => {
        if (entity === UserAccessProfile)
          return [{ profileId: 'profile-a' }, { profileId: 'profile-b' }];
        if (entity === AccessProfile) {
          return [
            { id: 'profile-a', scopeSiteId: 'site-a' },
            { id: 'profile-b', scopeSiteId: 'site-b' },
          ];
        }
        if (entity === AccessProfilePermission) return [{ profileId: 'profile-a' }];
        return [];
      }),
    };
    runInTenant.mockImplementation(async (_source, _schema, operation) =>
      operation({ manager } as never),
    );
    const adapter = new EffectivePermissionScopeAdapter(
      {} as DataSource,
      { getEffectivePermissionsForUser } as never,
    );
    getEffectivePermissionsForUser
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([AccessPermissionKey.NETWORK_CATALOG_READ]);

    await expect(
      adapter.listAuthorizedSiteScope({
        actorId: 'actor-id',
        permissionKey: AccessPermissionKey.NETWORK_CATALOG_READ,
      }),
    ).resolves.toEqual({ kind: 'SITE_IDS', siteIds: ['site-a'] });
    expect(manager.find).toHaveBeenCalledWith(
      AccessProfilePermission,
      expect.objectContaining({
        where: expect.objectContaining({
          permissionKey: AccessPermissionKey.NETWORK_CATALOG_READ,
        }),
      }),
    );
    expect(getEffectivePermissionsForUser).toHaveBeenLastCalledWith('actor-id', 'site-a');
  });

  it('deniega un scope de lista vacío con el error de permiso estándar', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue({ id: 'actor-id', role: UserRole.NOC }),
      find: jest.fn().mockResolvedValue([]),
    };
    runInTenant.mockImplementation(async (_source, _schema, operation) =>
      operation({ manager } as never),
    );
    const adapter = new EffectivePermissionScopeAdapter(
      {} as DataSource,
      { getEffectivePermissionsForUser } as never,
    );
    getEffectivePermissionsForUser.mockResolvedValue([]);

    await expect(
      adapter.listAuthorizedSiteScope({
        actorId: 'actor-id',
        permissionKey: AccessPermissionKey.NETWORK_CATALOG_READ,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
