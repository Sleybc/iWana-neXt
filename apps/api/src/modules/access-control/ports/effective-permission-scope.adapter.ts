import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  AccessProfile,
  AccessProfilePermission,
  TenantContext,
  User,
  UserAccessProfile,
  runInTenantSchema,
} from '@iwana/db';
import { AccessPermissionKey } from '@iwana/shared';
import { DataSource, In, IsNull, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import {
  EffectivePermissionScopePort,
  type AuthorizedSiteScope,
  type SiteActionDecision,
} from './effective-permission-scope.port';
import { EffectivePermissionsService } from '../services/effective-permissions.service';

const CATALOG_FAMILY = new Set<AccessPermissionKey>([
  AccessPermissionKey.NETWORK_CATALOG_READ,
  AccessPermissionKey.NETWORK_CATALOG_MANAGE,
]);
const PROVISIONING_FAMILY = new Set<AccessPermissionKey>([
  AccessPermissionKey.NETWORK_PROVISIONING_READ,
  AccessPermissionKey.NETWORK_PROVISIONING_EXECUTE,
  AccessPermissionKey.NETWORK_PROVISIONING_CERTIFY,
  AccessPermissionKey.NETWORK_PROVISIONING_REGULARIZE,
]);

@Injectable()
export class EffectivePermissionScopeAdapter extends EffectivePermissionScopePort {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly effectivePermissions: EffectivePermissionsService,
  ) {
    super();
  }

  async authorizeTenantWide(input: {
    actorId: string;
    permissionKey: AccessPermissionKey;
  }): Promise<boolean> {
    const effective = await this.effectivePermissions.getEffectivePermissionsForUser(input.actorId);
    return effective.includes(input.permissionKey);
  }

  async evaluateSite(input: {
    actorId: string;
    siteId: string;
    permissionKey: AccessPermissionKey;
  }): Promise<SiteActionDecision> {
    const effective = new Set(
      await this.effectivePermissions.getEffectivePermissionsForUser(input.actorId, input.siteId),
    );
    if (effective.has(input.permissionKey)) return 'ALLOWED';

    const family = this.permissionFamily(input.permissionKey);
    if (family.some((permission) => effective.has(permission))) return 'IN_SCOPE_NO_ACTION';
    return 'OUT_OF_SCOPE';
  }

  async listAuthorizedSiteScope(input: {
    actorId: string;
    permissionKey: AccessPermissionKey;
  }): Promise<AuthorizedSiteScope> {
    if (await this.authorizeTenantWide(input)) return { kind: 'TENANT_WIDE' };

    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const today = new Date().toISOString().slice(0, 10);
    const siteIds = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const user = await qr.manager.findOne(User, {
        where: { tenantId, id: input.actorId },
        select: ['id', 'role'],
      });
      if (!user) return [];

      const assignments = await qr.manager.find(UserAccessProfile, {
        where: [
          {
            tenantId,
            userId: input.actorId,
            isActive: true,
            validFrom: LessThanOrEqual(today),
            validTo: IsNull(),
          },
          {
            tenantId,
            userId: input.actorId,
            isActive: true,
            validFrom: LessThanOrEqual(today),
            validTo: MoreThanOrEqual(today),
          },
        ],
        select: ['profileId'],
      });
      if (assignments.length === 0) return [];

      const profiles = await qr.manager.find(AccessProfile, {
        where: {
          tenantId,
          id: In(assignments.map((assignment) => assignment.profileId)),
          isActive: true,
          baseRoleConstraint: user.role,
        },
        select: ['id', 'scopeSiteId'],
      });
      const scopedProfiles = profiles.filter(
        (profile) => profile.scopeSiteId !== null && profile.scopeSiteId !== undefined,
      );
      if (scopedProfiles.length === 0) return [];

      const permissions = await qr.manager.find(AccessProfilePermission, {
        where: {
          tenantId,
          profileId: In(scopedProfiles.map((profile) => profile.id)),
          permissionKey: input.permissionKey,
        },
        select: ['profileId'],
      });
      const permissionProfileIds = new Set(permissions.map((permission) => permission.profileId));
      return [
        ...new Set(
          scopedProfiles
            .filter((profile) => permissionProfileIds.has(profile.id))
            .map((profile) => profile.scopeSiteId)
            .filter((siteId): siteId is string => typeof siteId === 'string'),
        ),
      ];
    });

    const permittedSiteIds: string[] = [];
    for (const siteId of siteIds) {
      const effective = await this.effectivePermissions.getEffectivePermissionsForUser(
        input.actorId,
        siteId,
      );
      if (effective.includes(input.permissionKey)) permittedSiteIds.push(siteId);
    }

    if (permittedSiteIds.length === 0) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'No tienes autorización para esta operación.',
      });
    }
    return { kind: 'SITE_IDS', siteIds: permittedSiteIds };
  }

  private permissionFamily(permissionKey: AccessPermissionKey): AccessPermissionKey[] {
    if (CATALOG_FAMILY.has(permissionKey)) return [...CATALOG_FAMILY];
    if (PROVISIONING_FAMILY.has(permissionKey)) return [...PROVISIONING_FAMILY];
    return [];
  }
}
