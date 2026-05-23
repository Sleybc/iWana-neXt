import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  AccessProfile,
  AccessProfilePermission,
  TenantContext,
  User,
  UserAccessProfile,
  runInTenantSchema,
} from '@iwana/db';
import { AccessPermissionKey, UserRole } from '@iwana/shared';
import { DataSource, In, LessThanOrEqual, MoreThanOrEqual, IsNull } from 'typeorm';
import { ROLE_ASSIGNABLE_PERMISSION_MATRIX } from '../access-control.constants';

const ADMIN_BASELINE_PERMISSIONS: AccessPermissionKey[] = [
  ...(ROLE_ASSIGNABLE_PERMISSION_MATRIX[UserRole.ADMIN] ?? []),
];

@Injectable()
export class EffectivePermissionsService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async getEffectivePermissionsForUser(
    userId: string,
    scopedSiteId?: string,
  ): Promise<AccessPermissionKey[]> {
    const ctx = TenantContext.getOrThrow();
    const today = this.currentDate();

    return runInTenantSchema(this.dataSource, ctx.schemaName, async (qr) => {
      const user = await qr.manager.findOne(User, {
        where: { tenantId: ctx.tenantId, id: userId },
      });

      if (!user) {
        throw new NotFoundException(`Usuario ${userId} no encontrado.`);
      }

      const effectivePermissions = new Set<AccessPermissionKey>(
        this.getBaselinePermissions(user.role),
      );

      const assignments = await qr.manager.find(UserAccessProfile, {
        where: [
          {
            tenantId: ctx.tenantId,
            userId,
            isActive: true,
            validFrom: LessThanOrEqual(today),
            validTo: IsNull(),
          },
          {
            tenantId: ctx.tenantId,
            userId,
            isActive: true,
            validFrom: LessThanOrEqual(today),
            validTo: MoreThanOrEqual(today),
          },
        ],
      });

      if (assignments.length === 0) {
        return [...effectivePermissions].sort();
      }

      const profiles = await qr.manager.find(AccessProfile, {
        where: {
          tenantId: ctx.tenantId,
          id: In(assignments.map((assignment) => assignment.profileId)),
          isActive: true,
        },
      });

      const compatibleProfileIds = profiles
        .filter(
          (profile) =>
            profile.baseRoleConstraint === user.role &&
            (profile.scopeSiteId === null ||
              profile.scopeSiteId === undefined ||
              profile.scopeSiteId === scopedSiteId),
        )
        .map((profile) => profile.id);

      if (compatibleProfileIds.length === 0) {
        return [...effectivePermissions].sort();
      }

      const permissions = await qr.manager.find(AccessProfilePermission, {
        where: {
          tenantId: ctx.tenantId,
          profileId: In(compatibleProfileIds),
        },
      });

      permissions.forEach((permission) => {
        effectivePermissions.add(permission.permissionKey);
      });

      return [...effectivePermissions].sort();
    });
  }

  private getBaselinePermissions(role: UserRole): AccessPermissionKey[] {
    if (role === UserRole.ADMIN) {
      return ADMIN_BASELINE_PERMISSIONS;
    }

    return [];
  }

  private currentDate(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
