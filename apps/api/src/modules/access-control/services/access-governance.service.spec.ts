import { ForbiddenException } from '@nestjs/common';
import { AccessPermissionKey, UserRole, UserStatus } from '@iwana/shared';
import { AccessGovernanceService } from './access-governance.service';

describe('AccessGovernanceService', () => {
  let service: AccessGovernanceService;

  beforeEach(() => {
    service = new AccessGovernanceService();
  });

  it('rechaza remover el ultimo camino efectivo de admin en replaceUserProfiles', async () => {
    const manager = {
      find: jest
        .fn()
        .mockResolvedValueOnce([
          {
            id: 'admin-1',
            tenantId: 'tenant-test',
            role: UserRole.ADMIN,
            status: UserStatus.ACTIVE,
          },
        ])
        .mockResolvedValueOnce([{ userId: 'admin-1', profileId: 'profile-admin', isActive: true }])
        .mockResolvedValueOnce([
          {
            id: 'profile-admin',
            tenantId: 'tenant-test',
            isActive: true,
            baseRoleConstraint: UserRole.ADMIN,
          },
        ])
        .mockResolvedValueOnce([
          {
            profileId: 'profile-admin',
            permissionKey: AccessPermissionKey.ACCESS_ASSIGNMENTS_MANAGE,
          },
        ]),
    };

    await expect(
      service.assertUserProfilesMutationAllowed(
        manager as never,
        'tenant-test',
        { id: 'admin-1', role: UserRole.ADMIN },
        [],
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('permite la mutacion si otro admin conserva access.assignments.manage', async () => {
    const manager = {
      find: jest
        .fn()
        .mockResolvedValueOnce([
          {
            id: 'admin-1',
            tenantId: 'tenant-test',
            role: UserRole.ADMIN,
            status: UserStatus.ACTIVE,
          },
          {
            id: 'admin-2',
            tenantId: 'tenant-test',
            role: UserRole.ADMIN,
            status: UserStatus.ACTIVE,
          },
        ])
        .mockResolvedValueOnce([
          { userId: 'admin-1', profileId: 'profile-admin-1', isActive: true },
          { userId: 'admin-2', profileId: 'profile-admin-2', isActive: true },
        ])
        .mockResolvedValueOnce([
          {
            id: 'profile-admin-1',
            tenantId: 'tenant-test',
            isActive: true,
            baseRoleConstraint: UserRole.ADMIN,
          },
          {
            id: 'profile-admin-2',
            tenantId: 'tenant-test',
            isActive: true,
            baseRoleConstraint: UserRole.ADMIN,
          },
        ])
        .mockResolvedValueOnce([
          {
            profileId: 'profile-admin-1',
            permissionKey: AccessPermissionKey.ACCESS_ASSIGNMENTS_MANAGE,
          },
          {
            profileId: 'profile-admin-2',
            permissionKey: AccessPermissionKey.ACCESS_ASSIGNMENTS_MANAGE,
          },
        ]),
    };

    await expect(
      service.assertUserProfilesMutationAllowed(
        manager as never,
        'tenant-test',
        { id: 'admin-1', role: UserRole.ADMIN },
        [],
      ),
    ).resolves.toBeUndefined();
  });

  it('rechaza desactivar el ultimo perfil admin con permiso de asignacion', async () => {
    const manager = {
      find: jest
        .fn()
        .mockResolvedValueOnce([
          {
            id: 'admin-1',
            tenantId: 'tenant-test',
            role: UserRole.ADMIN,
            status: UserStatus.ACTIVE,
          },
        ])
        .mockResolvedValueOnce([{ userId: 'admin-1', profileId: 'profile-admin', isActive: true }])
        .mockResolvedValueOnce([
          {
            id: 'profile-admin',
            tenantId: 'tenant-test',
            isActive: true,
            baseRoleConstraint: UserRole.ADMIN,
          },
        ])
        .mockResolvedValueOnce([
          {
            profileId: 'profile-admin',
            permissionKey: AccessPermissionKey.ACCESS_ASSIGNMENTS_MANAGE,
          },
        ]),
    };

    await expect(
      service.assertProfileMutationAllowed(manager as never, 'tenant-test', {
        profileId: 'profile-admin',
        nextIsActive: false,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
