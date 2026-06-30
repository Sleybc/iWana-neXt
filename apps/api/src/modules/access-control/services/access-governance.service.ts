import { ForbiddenException, Injectable } from '@nestjs/common';
import { AccessProfile, AccessProfilePermission, User, UserAccessProfile } from '@iwana/db';
import { AccessPermissionKey, UserRole, UserStatus } from '@iwana/shared';
import { EntityManager, In, IsNull, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';

interface ProfileGovernanceOverride {
  profileId: string;
  nextIsActive?: boolean;
  nextBaseRoleConstraint?: UserRole | null;
  nextPermissionKeys?: AccessPermissionKey[];
}

interface AdminManageState {
  adminUserIds: string[];
  profileIdsByUser: Map<string, string[]>;
  profilesById: Map<
    string,
    {
      isActive: boolean;
      baseRoleConstraint: UserRole | null;
      permissions: Set<AccessPermissionKey>;
    }
  >;
}

@Injectable()
export class AccessGovernanceService {
  async assertUserProfilesMutationAllowed(
    manager: EntityManager,
    tenantId: string,
    user: Pick<User, 'id' | 'role'>,
    nextProfileIds: string[],
  ): Promise<void> {
    if (user.role !== UserRole.ADMIN) {
      return;
    }

    const currentState = await this.loadAdminManageState(manager, tenantId, nextProfileIds);
    const currentCount = this.countAdminManageUsers(currentState);

    const nextState = this.cloneState(currentState);
    nextState.profileIdsByUser.set(user.id, [...nextProfileIds]);

    const nextCount = this.countAdminManageUsers(nextState);
    this.ensureAdminManagePathRemains(currentCount, nextCount);
  }

  async assertProfileMutationAllowed(
    manager: EntityManager,
    tenantId: string,
    override: ProfileGovernanceOverride,
  ): Promise<void> {
    const currentState = await this.loadAdminManageState(manager, tenantId, [override.profileId]);
    const currentCount = this.countAdminManageUsers(currentState);

    const nextState = this.cloneState(currentState);
    const currentProfile = nextState.profilesById.get(override.profileId) ?? {
      isActive: true,
      baseRoleConstraint: null,
      permissions: new Set<AccessPermissionKey>(),
    };

    nextState.profilesById.set(override.profileId, {
      isActive: override.nextIsActive ?? currentProfile.isActive,
      baseRoleConstraint: override.nextBaseRoleConstraint ?? currentProfile.baseRoleConstraint,
      permissions:
        override.nextPermissionKeys !== undefined
          ? new Set(override.nextPermissionKeys)
          : new Set(currentProfile.permissions),
    });

    const nextCount = this.countAdminManageUsers(nextState);
    this.ensureAdminManagePathRemains(currentCount, nextCount);
  }

  private ensureAdminManagePathRemains(currentCount: number, nextCount: number): void {
    if (currentCount > 0 && nextCount === 0) {
      throw new ForbiddenException({
        code: 'LAST_ADMIN_ACCESS_LOCKOUT',
        message:
          'No se puede remover el último acceso admin efectivo para asignar perfiles de acceso.',
      });
    }
  }

  private async loadAdminManageState(
    manager: EntityManager,
    tenantId: string,
    extraProfileIds: string[] = [],
  ): Promise<AdminManageState> {
    const today = this.currentDate();
    const adminUsers = await manager.find(User, {
      where: {
        tenantId,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      },
    });

    const adminUserIds = adminUsers.map((user) => user.id);
    if (adminUserIds.length === 0) {
      return {
        adminUserIds: [],
        profileIdsByUser: new Map(),
        profilesById: new Map(),
      };
    }

    const assignments = await manager.find(UserAccessProfile, {
      where: [
        {
          tenantId,
          userId: In(adminUserIds),
          isActive: true,
          validFrom: LessThanOrEqual(today),
          validTo: IsNull(),
        },
        {
          tenantId,
          userId: In(adminUserIds),
          isActive: true,
          validFrom: LessThanOrEqual(today),
          validTo: MoreThanOrEqual(today),
        },
      ],
    });

    const profileIds = Array.from(
      new Set([...assignments.map((assignment) => assignment.profileId), ...extraProfileIds]),
    );

    const profiles = profileIds.length
      ? await manager.find(AccessProfile, {
          where: { tenantId, id: In(profileIds) },
        })
      : [];

    const permissions = profileIds.length
      ? await manager.find(AccessProfilePermission, {
          where: { tenantId, profileId: In(profileIds) },
        })
      : [];

    const permissionsByProfileId = new Map<string, Set<AccessPermissionKey>>();
    permissions.forEach((permission) => {
      const current =
        permissionsByProfileId.get(permission.profileId) ?? new Set<AccessPermissionKey>();
      current.add(permission.permissionKey);
      permissionsByProfileId.set(permission.profileId, current);
    });

    const profilesById = new Map(
      profiles.map((profile) => [
        profile.id,
        {
          isActive: profile.isActive,
          baseRoleConstraint: profile.baseRoleConstraint,
          permissions: permissionsByProfileId.get(profile.id) ?? new Set<AccessPermissionKey>(),
        },
      ]),
    );

    const profileIdsByUser = new Map<string, string[]>();
    assignments.forEach((assignment) => {
      const current = profileIdsByUser.get(assignment.userId) ?? [];
      current.push(assignment.profileId);
      profileIdsByUser.set(assignment.userId, current);
    });

    return {
      adminUserIds,
      profileIdsByUser,
      profilesById,
    };
  }

  private countAdminManageUsers(state: AdminManageState): number {
    return state.adminUserIds.filter((userId) => {
      const profileIds = state.profileIdsByUser.get(userId) ?? [];

      return profileIds.some((profileId) => {
        const profile = state.profilesById.get(profileId);

        return (
          !!profile &&
          profile.isActive &&
          profile.baseRoleConstraint === UserRole.ADMIN &&
          profile.permissions.has(AccessPermissionKey.ACCESS_ASSIGNMENTS_MANAGE)
        );
      });
    }).length;
  }

  private cloneState(state: AdminManageState): AdminManageState {
    return {
      adminUserIds: [...state.adminUserIds],
      profileIdsByUser: new Map(
        [...state.profileIdsByUser.entries()].map(([userId, profileIds]) => [
          userId,
          [...profileIds],
        ]),
      ),
      profilesById: new Map(
        [...state.profilesById.entries()].map(([profileId, profile]) => [
          profileId,
          {
            isActive: profile.isActive,
            baseRoleConstraint: profile.baseRoleConstraint,
            permissions: new Set(profile.permissions),
          },
        ]),
      ),
    };
  }

  private currentDate(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
