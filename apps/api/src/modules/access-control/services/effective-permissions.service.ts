import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
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
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.module';
import { ROLE_ASSIGNABLE_PERMISSION_MATRIX_V2 } from '../access-control.constants';

const ADMIN_BASELINE_PERMISSIONS: AccessPermissionKey[] = [
  ...(ROLE_ASSIGNABLE_PERMISSION_MATRIX_V2[UserRole.ADMIN] ?? []),
];

const CACHE_TTL_SECONDS = 60;
const CACHE_PREFIX = 'access:perms';

@Injectable()
export class EffectivePermissionsService {
  private readonly logger = new Logger(EffectivePermissionsService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  private buildCacheKey(tenantId: string, userId: string): string {
    return `${CACHE_PREFIX}:${tenantId}:${userId}`;
  }

  async getEffectivePermissionsForUser(
    userId: string,
    scopedSiteId?: string,
  ): Promise<AccessPermissionKey[]> {
    const ctx = TenantContext.getOrThrow();

    // Scoped queries bypass cache (site-specific filtering)
    if (scopedSiteId) {
      return this.computeEffectivePermissions(ctx.tenantId, ctx.schemaName, userId, scopedSiteId);
    }

    const cacheKey = this.buildCacheKey(ctx.tenantId, userId);

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as AccessPermissionKey[];
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (error) {
      this.logger.warn(
        `Cache get fallo para ${cacheKey}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const result = await this.computeEffectivePermissions(
      ctx.tenantId,
      ctx.schemaName,
      userId,
      undefined,
    );

    try {
      await this.redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL_SECONDS);
    } catch (error) {
      this.logger.warn(
        `Cache set fallo para ${cacheKey}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return result;
  }

  private async computeEffectivePermissions(
    tenantId: string,
    schemaName: string,
    userId: string,
    scopedSiteId?: string,
  ): Promise<AccessPermissionKey[]> {
    const today = this.currentDate();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const user = await qr.manager.findOne(User, {
        where: { tenantId, id: userId },
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
            tenantId,
            userId,
            isActive: true,
            validFrom: LessThanOrEqual(today),
            validTo: IsNull(),
          },
          {
            tenantId,
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
          tenantId,
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
          tenantId,
          profileId: In(compatibleProfileIds),
        },
      });

      permissions.forEach((permission) => {
        effectivePermissions.add(permission.permissionKey);
      });

      return [...effectivePermissions].sort();
    });
  }

  async invalidateUserPermissions(tenantId: string, userId: string): Promise<void> {
    const key = this.buildCacheKey(tenantId, userId);
    try {
      await this.redis.del(key);
    } catch (error) {
      this.logger.warn(
        `Cache del fallo para ${key}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async invalidateUsersPermissions(tenantId: string, userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;
    const keys = userIds.map((id) => this.buildCacheKey(tenantId, id));
    try {
      await this.redis.del(...keys);
    } catch (error) {
      this.logger.warn(
        `Cache del fan-out fallo para ${tenantId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Invalidación por abanico para mutaciones de perfil (crear/editar/reemplazar/borrar).
   * Busca usuarios con asignación activa al perfil y elimina sus cachés.
   */
  async invalidateByProfile(
    tenantId: string,
    schemaName: string,
    profileId: string,
  ): Promise<void> {
    try {
      const userIds = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
        const rows = await qr.manager.find(UserAccessProfile, {
          where: { tenantId, profileId, isActive: true },
        });
        return [...new Set(rows.map((r) => r.userId))];
      });
      await this.invalidateUsersPermissions(tenantId, userIds);
    } catch (error) {
      this.logger.warn(
        `Fan-out por perfil ${profileId} fallo: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async invalidateByProfiles(
    tenantId: string,
    schemaName: string,
    profileIds: string[],
  ): Promise<void> {
    if (profileIds.length === 0) return;
    try {
      const userIds = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
        const rows = await qr.manager.find(UserAccessProfile, {
          where: { tenantId, profileId: In(profileIds), isActive: true },
        });
        return [...new Set(rows.map((r) => r.userId))];
      });
      await this.invalidateUsersPermissions(tenantId, userIds);
    } catch (error) {
      this.logger.warn(
        `Fan-out por perfiles fallo: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
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
