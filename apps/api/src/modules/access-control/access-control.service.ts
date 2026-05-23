import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  AccessPermissionCatalog,
  AccessProfile,
  AccessProfilePermission,
  TenantContext,
  User,
  UserAccessProfile,
  runInTenantSchema,
} from '@iwana/db';
import {
  AccessPermissionAvailability,
  AccessPermissionCatalogVersion,
  AccessPermissionKey,
  AuditAction,
  UserRole,
} from '@iwana/shared';
import { DataSource, EntityManager, In } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { AccessGovernanceService } from './services/access-governance.service';
import {
  MOD00_ACCESS_V1_CATALOG,
  ROLE_ASSIGNABLE_PERMISSION_MATRIX,
} from './access-control.constants';
import {
  CreateAccessProfileDto,
  ReplaceProfilePermissionsDto,
  ReplaceUserProfilesDto,
  UpdateAccessProfileDto,
} from './dto/access-control.dto';

interface MutationAuditContext {
  userId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

export interface AccessProfileView {
  id: string;
  name: string;
  description: string | null;
  baseRoleConstraint: UserRole | null;
  scopeSiteId: string | null;
  isSystem: boolean;
  isActive: boolean;
  permissions: AccessPermissionKey[];
  createdAt: Date;
  updatedAt: Date;
}

export interface EffectivePermissionSourceView {
  profileId: string;
  profileName: string;
  permissions: AccessPermissionKey[];
}

export interface EffectivePermissionsSummaryView {
  userId: string;
  role: UserRole;
  effectivePermissions: AccessPermissionKey[];
  recoveryPermissions: AccessPermissionKey[];
  profileSources: EffectivePermissionSourceView[];
}

@Injectable()
export class AccessControlService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly accessGovernanceService: AccessGovernanceService,
  ) {}

  async listPermissions() {
    const ctx = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, ctx.schemaName, async (qr) => {
      await this.ensurePermissionCatalogSeeded(qr.manager, ctx.tenantId);

      const permissions = await qr.manager.find(AccessPermissionCatalog, {
        where: { tenantId: ctx.tenantId, isActive: true },
        order: { moduleKey: 'ASC', permissionKey: 'ASC' },
      });

      return {
        version: AccessPermissionCatalogVersion.MOD00_ACCESS_V1,
        permissions,
        compatibilityMatrix: ROLE_ASSIGNABLE_PERMISSION_MATRIX,
      };
    });
  }

  async listProfiles(): Promise<AccessProfileView[]> {
    const ctx = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, ctx.schemaName, async (qr) => {
      await this.ensurePermissionCatalogSeeded(qr.manager, ctx.tenantId);
      const profiles = await qr.manager.find(AccessProfile, {
        where: { tenantId: ctx.tenantId },
        order: { name: 'ASC' },
      });

      return this.toProfileViews(qr.manager, ctx.tenantId, profiles);
    });
  }

  async getEffectivePermissionsSummary(userId: string): Promise<EffectivePermissionsSummaryView> {
    const ctx = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, ctx.schemaName, async (qr) => {
      const user = await qr.manager.findOne(User, {
        where: { tenantId: ctx.tenantId, id: userId },
      });

      if (!user) {
        throw new NotFoundException(`Usuario ${userId} no encontrado.`);
      }

      const recoveryPermissions = this.getRecoveryPermissions(user.role);
      const profileSources = await this.loadEffectivePermissionSources(
        qr.manager,
        ctx.tenantId,
        userId,
        user.role,
      );
      const effectivePermissions = new Set<AccessPermissionKey>(recoveryPermissions);

      profileSources.forEach((source) => {
        source.permissions.forEach((permission) => {
          effectivePermissions.add(permission);
        });
      });

      return {
        userId,
        role: user.role,
        effectivePermissions: [...effectivePermissions].sort(),
        recoveryPermissions,
        profileSources,
      };
    });
  }

  async createProfile(
    dto: CreateAccessProfileDto,
    auditContext?: MutationAuditContext,
  ): Promise<AccessProfileView> {
    const ctx = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, ctx.schemaName, async (qr) => {
      await this.ensurePermissionCatalogSeeded(qr.manager, ctx.tenantId);
      this.ensureRoleAllowedForTenantProfiles(dto.baseRoleConstraint);

      const permissionKeys = dto.permissionKeys ?? [];
      await this.validatePermissionKeys(
        qr.manager,
        ctx.tenantId,
        permissionKeys,
        dto.baseRoleConstraint,
      );

      const existing = await qr.manager.findOne(AccessProfile, {
        where: { tenantId: ctx.tenantId, name: dto.name.trim() },
      });
      if (existing) {
        throw new BadRequestException({
          code: 'PROFILE_NAME_ALREADY_EXISTS',
          message: 'Ya existe un perfil activo con ese nombre.',
        });
      }

      const profile = qr.manager.create(AccessProfile, {
        tenantId: ctx.tenantId,
        name: dto.name.trim(),
        description: dto.description?.trim() ?? null,
        baseRoleConstraint: dto.baseRoleConstraint,
        scopeSiteId: dto.scopeSiteId ?? null,
        isSystem: false,
        isActive: true,
      });

      const saved = await qr.manager.save(AccessProfile, profile);
      await this.replaceProfilePermissionsInternal(
        qr.manager,
        ctx.tenantId,
        saved.id,
        permissionKeys,
      );
      const after = await this.loadProfileView(qr.manager, ctx.tenantId, saved.id);

      await this.auditService.log({
        tenantId: ctx.tenantId,
        schemaName: ctx.schemaName,
        userId: auditContext?.userId ?? null,
        action: AuditAction.CREATE,
        entityType: 'access_profile',
        entityId: saved.id,
        oldValue: null,
        newValue: this.sanitizeProfileForAudit(after),
        ipAddress: auditContext?.ipAddress ?? null,
        userAgent: auditContext?.userAgent ?? null,
        requestId: auditContext?.requestId ?? null,
      });

      return after;
    });
  }

  async updateProfile(
    id: string,
    dto: UpdateAccessProfileDto,
    auditContext?: MutationAuditContext,
  ): Promise<AccessProfileView> {
    const ctx = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, ctx.schemaName, async (qr) => {
      await this.ensurePermissionCatalogSeeded(qr.manager, ctx.tenantId);

      const profile = await this.findProfileEntity(qr.manager, ctx.tenantId, id);
      const before = await this.loadProfileView(qr.manager, ctx.tenantId, id);

      if (dto.name && dto.name.trim() !== profile.name) {
        const existing = await qr.manager.findOne(AccessProfile, {
          where: { tenantId: ctx.tenantId, name: dto.name.trim() },
        });
        if (existing && existing.id !== id) {
          throw new BadRequestException({
            code: 'PROFILE_NAME_ALREADY_EXISTS',
            message: 'Ya existe un perfil activo con ese nombre.',
          });
        }
      }

      const nextBaseRole = dto.baseRoleConstraint ?? profile.baseRoleConstraint;
      if (!profile.isSystem && !nextBaseRole) {
        throw new BadRequestException({
          code: 'PROFILE_BASE_ROLE_REQUIRED',
          message: 'El perfil debe declarar baseRoleConstraint en Fase 01.',
        });
      }

      if (nextBaseRole) {
        this.ensureRoleAllowedForTenantProfiles(nextBaseRole);
        const currentPermissions = await this.loadProfilePermissionKeys(
          qr.manager,
          ctx.tenantId,
          id,
        );
        await this.validatePermissionKeys(
          qr.manager,
          ctx.tenantId,
          currentPermissions,
          nextBaseRole,
        );
      }

      if (
        profile.baseRoleConstraint === UserRole.ADMIN &&
        ((dto.baseRoleConstraint !== undefined && dto.baseRoleConstraint !== UserRole.ADMIN) ||
          (dto.isActive !== undefined && dto.isActive === false))
      ) {
        await this.accessGovernanceService.assertProfileMutationAllowed(qr.manager, ctx.tenantId, {
          profileId: id,
          nextBaseRoleConstraint: dto.baseRoleConstraint ?? profile.baseRoleConstraint,
          nextIsActive: dto.isActive ?? profile.isActive,
        });
      }

      if (dto.name !== undefined) profile.name = dto.name.trim();
      if (dto.description !== undefined) profile.description = dto.description?.trim() ?? null;
      if (dto.baseRoleConstraint !== undefined) profile.baseRoleConstraint = dto.baseRoleConstraint;
      if (dto.scopeSiteId !== undefined) profile.scopeSiteId = dto.scopeSiteId ?? null;
      if (dto.isActive !== undefined) profile.isActive = dto.isActive;

      await qr.manager.save(AccessProfile, profile);
      const after = await this.loadProfileView(qr.manager, ctx.tenantId, id);

      await this.auditService.log({
        tenantId: ctx.tenantId,
        schemaName: ctx.schemaName,
        userId: auditContext?.userId ?? null,
        action: AuditAction.UPDATE,
        entityType: 'access_profile',
        entityId: id,
        oldValue: this.sanitizeProfileForAudit(before),
        newValue: this.sanitizeProfileForAudit(after),
        ipAddress: auditContext?.ipAddress ?? null,
        userAgent: auditContext?.userAgent ?? null,
        requestId: auditContext?.requestId ?? null,
      });

      return after;
    });
  }

  async removeProfile(id: string, auditContext?: MutationAuditContext): Promise<void> {
    const ctx = TenantContext.getOrThrow();

    await runInTenantSchema(this.dataSource, ctx.schemaName, async (qr) => {
      await this.ensurePermissionCatalogSeeded(qr.manager, ctx.tenantId);

      const profile = await this.findProfileEntity(qr.manager, ctx.tenantId, id);
      if (profile.isSystem) {
        throw new ForbiddenException('Los perfiles del sistema no se pueden eliminar.');
      }

      const before = await this.loadProfileView(qr.manager, ctx.tenantId, id);
      await this.accessGovernanceService.assertProfileMutationAllowed(qr.manager, ctx.tenantId, {
        profileId: id,
        nextIsActive: false,
      });
      await qr.manager.softDelete(AccessProfile, { tenantId: ctx.tenantId, id });

      const assignments = await qr.manager.find(UserAccessProfile, {
        where: { tenantId: ctx.tenantId, profileId: id, isActive: true },
      });
      if (assignments.length > 0) {
        assignments.forEach((entry) => {
          entry.isActive = false;
          entry.validTo = entry.validTo ?? this.currentDate();
        });
        await qr.manager.save(UserAccessProfile, assignments);
      }

      await this.auditService.log({
        tenantId: ctx.tenantId,
        schemaName: ctx.schemaName,
        userId: auditContext?.userId ?? null,
        action: AuditAction.DELETE,
        entityType: 'access_profile',
        entityId: id,
        oldValue: this.sanitizeProfileForAudit(before),
        newValue: null,
        ipAddress: auditContext?.ipAddress ?? null,
        userAgent: auditContext?.userAgent ?? null,
        requestId: auditContext?.requestId ?? null,
      });
    });
  }

  async replaceProfilePermissions(
    id: string,
    dto: ReplaceProfilePermissionsDto,
    auditContext?: MutationAuditContext,
  ): Promise<AccessProfileView> {
    const ctx = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, ctx.schemaName, async (qr) => {
      await this.ensurePermissionCatalogSeeded(qr.manager, ctx.tenantId);

      const profile = await this.findProfileEntity(qr.manager, ctx.tenantId, id);
      if (!profile.baseRoleConstraint) {
        throw new BadRequestException({
          code: 'PROFILE_BASE_ROLE_REQUIRED',
          message: 'El perfil debe declarar baseRoleConstraint en Fase 01.',
        });
      }

      await this.validatePermissionKeys(
        qr.manager,
        ctx.tenantId,
        dto.permissionKeys,
        profile.baseRoleConstraint,
      );

      const before = await this.loadProfileView(qr.manager, ctx.tenantId, id);
      await this.accessGovernanceService.assertProfileMutationAllowed(qr.manager, ctx.tenantId, {
        profileId: id,
        nextPermissionKeys: dto.permissionKeys,
      });
      await this.replaceProfilePermissionsInternal(
        qr.manager,
        ctx.tenantId,
        id,
        dto.permissionKeys,
      );
      const after = await this.loadProfileView(qr.manager, ctx.tenantId, id);

      await this.auditService.log({
        tenantId: ctx.tenantId,
        schemaName: ctx.schemaName,
        userId: auditContext?.userId ?? null,
        action: AuditAction.UPDATE,
        entityType: 'access_profile_permissions',
        entityId: id,
        oldValue: {
          permissions: before.permissions,
          permissionImpact: this.buildCollectionDelta(before.permissions, after.permissions),
        },
        newValue: {
          permissions: after.permissions,
          permissionImpact: this.buildCollectionDelta(before.permissions, after.permissions),
          profileName: after.name,
        },
        ipAddress: auditContext?.ipAddress ?? null,
        userAgent: auditContext?.userAgent ?? null,
        requestId: auditContext?.requestId ?? null,
      });

      return after;
    });
  }

  async replaceUserProfiles(
    userId: string,
    dto: ReplaceUserProfilesDto,
    auditContext?: MutationAuditContext,
  ): Promise<{ userId: string; role: UserRole; profileIds: string[] }> {
    const ctx = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, ctx.schemaName, async (qr) => {
      await this.ensurePermissionCatalogSeeded(qr.manager, ctx.tenantId);

      const user = await qr.manager.findOne(User, {
        where: { tenantId: ctx.tenantId, id: userId },
      });
      if (!user) {
        throw new NotFoundException(`Usuario ${userId} no encontrado.`);
      }

      if (user.role === UserRole.SYSTEM_ADMIN || user.role === UserRole.IWANA_SUPPORT) {
        throw new ForbiddenException({
          code: 'PLATFORM_ROLE_NOT_TENANT_ASSIGNABLE',
          message: 'No se pueden asignar perfiles tenant a roles de plataforma.',
        });
      }

      const profiles = dto.profileIds.length
        ? await qr.manager.find(AccessProfile, {
            where: { tenantId: ctx.tenantId, id: In(dto.profileIds), isActive: true },
          })
        : [];

      if (profiles.length !== dto.profileIds.length) {
        throw new NotFoundException('Uno o más perfiles no existen o no están activos.');
      }

      profiles.forEach((profile) => {
        if (!profile.baseRoleConstraint || profile.baseRoleConstraint !== user.role) {
          throw new BadRequestException({
            code: 'PROFILE_ROLE_INCOMPATIBLE',
            message: 'El perfil no es compatible con el rol base del usuario.',
          });
        }
      });

      await this.accessGovernanceService.assertUserProfilesMutationAllowed(
        qr.manager,
        ctx.tenantId,
        user,
        dto.profileIds,
      );

      const currentAssignments = await qr.manager.find(UserAccessProfile, {
        where: { tenantId: ctx.tenantId, userId, isActive: true },
      });
      if (currentAssignments.length > 0) {
        currentAssignments.forEach((entry) => {
          entry.isActive = false;
          entry.validTo = entry.validTo ?? this.currentDate();
        });
        await qr.manager.save(UserAccessProfile, currentAssignments);
      }

      if (profiles.length > 0) {
        await qr.manager.save(
          UserAccessProfile,
          profiles.map((profile) =>
            qr.manager.create(UserAccessProfile, {
              tenantId: ctx.tenantId,
              userId,
              profileId: profile.id,
              validFrom: this.currentDate(),
              validTo: null,
              isActive: true,
            }),
          ),
        );
      }

      const newProfileIds = profiles.map((profile) => profile.id);
      const profileDelta = this.buildCollectionDelta(
        currentAssignments.map((entry) => entry.profileId),
        newProfileIds,
      );
      await this.auditService.log({
        tenantId: ctx.tenantId,
        schemaName: ctx.schemaName,
        userId: auditContext?.userId ?? null,
        action: AuditAction.UPDATE,
        entityType: 'user_access_profiles',
        entityId: userId,
        oldValue: {
          role: user.role,
          profileIds: currentAssignments.map((entry) => entry.profileId),
          assignmentImpact: profileDelta,
        },
        newValue: {
          role: user.role,
          profileIds: newProfileIds,
          assignmentImpact: profileDelta,
        },
        ipAddress: auditContext?.ipAddress ?? null,
        userAgent: auditContext?.userAgent ?? null,
        requestId: auditContext?.requestId ?? null,
      });

      return {
        userId,
        role: user.role,
        profileIds: newProfileIds,
      };
    });
  }

  private async ensurePermissionCatalogSeeded(
    manager: EntityManager,
    tenantId: string,
  ): Promise<void> {
    const existing = await manager.find(AccessPermissionCatalog, {
      where: {
        tenantId,
        permissionKey: In(MOD00_ACCESS_V1_CATALOG.map((entry) => entry.permissionKey)),
      },
    });

    const existingByKey = new Map(existing.map((entry) => [entry.permissionKey, entry]));
    const toSave = MOD00_ACCESS_V1_CATALOG.map((definition) => {
      const current = existingByKey.get(definition.permissionKey);
      if (current) {
        current.moduleKey = definition.moduleKey;
        current.action = definition.action;
        current.description = definition.description;
        current.catalogVersion = definition.catalogVersion;
        current.availability = definition.availability;
        current.isSystem = true;
        current.isActive = true;
        return current;
      }

      return manager.create(AccessPermissionCatalog, {
        tenantId,
        permissionKey: definition.permissionKey,
        moduleKey: definition.moduleKey,
        action: definition.action,
        description: definition.description,
        catalogVersion: definition.catalogVersion,
        availability: definition.availability,
        isSystem: true,
        isActive: true,
      });
    });

    await manager.save(AccessPermissionCatalog, toSave);
  }

  private ensureRoleAllowedForTenantProfiles(role: UserRole): void {
    if (role === UserRole.SYSTEM_ADMIN || role === UserRole.IWANA_SUPPORT) {
      throw new ForbiddenException({
        code: 'PLATFORM_ROLE_NOT_TENANT_ASSIGNABLE',
        message: 'No se pueden usar roles de plataforma en perfiles tenant.',
      });
    }
  }

  private async validatePermissionKeys(
    manager: EntityManager,
    tenantId: string,
    permissionKeys: AccessPermissionKey[],
    baseRoleConstraint: UserRole,
  ): Promise<void> {
    this.ensureRoleAllowedForTenantProfiles(baseRoleConstraint);

    const allowedPermissions = new Set(ROLE_ASSIGNABLE_PERMISSION_MATRIX[baseRoleConstraint] ?? []);
    const permissions = permissionKeys.length
      ? await manager.find(AccessPermissionCatalog, {
          where: { tenantId, permissionKey: In(permissionKeys), isActive: true },
        })
      : [];
    const permissionsByKey = new Map(permissions.map((entry) => [entry.permissionKey, entry]));

    permissionKeys.forEach((permissionKey) => {
      const permission = permissionsByKey.get(permissionKey);
      if (!permission) {
        throw new BadRequestException({
          code: 'UNKNOWN_PERMISSION',
          message: `El permiso ${permissionKey} no existe en el catálogo activo.`,
        });
      }

      if (permission.availability === AccessPermissionAvailability.RESERVED) {
        throw new BadRequestException({
          code: 'PERMISSION_NOT_ASSIGNABLE_IN_PHASE',
          message: `El permiso ${permissionKey} está reservado para una fase futura.`,
        });
      }

      if (!allowedPermissions.has(permissionKey)) {
        throw new BadRequestException({
          code: 'PERMISSION_ROLE_INCOMPATIBLE',
          message: `El permiso ${permissionKey} no es compatible con el rol base ${baseRoleConstraint}.`,
        });
      }
    });
  }

  private async replaceProfilePermissionsInternal(
    manager: EntityManager,
    tenantId: string,
    profileId: string,
    permissionKeys: AccessPermissionKey[],
  ): Promise<void> {
    await manager.delete(AccessProfilePermission, { tenantId, profileId });

    if (permissionKeys.length === 0) {
      return;
    }

    await manager.save(
      AccessProfilePermission,
      permissionKeys.map((permissionKey) =>
        manager.create(AccessProfilePermission, {
          tenantId,
          profileId,
          permissionKey,
        }),
      ),
    );
  }

  private async loadProfileView(
    manager: EntityManager,
    tenantId: string,
    id: string,
  ): Promise<AccessProfileView> {
    const profile = await this.findProfileEntity(manager, tenantId, id);
    const permissions = await this.loadProfilePermissionKeys(manager, tenantId, id);

    return {
      id: profile.id,
      name: profile.name,
      description: profile.description,
      baseRoleConstraint: profile.baseRoleConstraint,
      scopeSiteId: profile.scopeSiteId,
      isSystem: profile.isSystem,
      isActive: profile.isActive,
      permissions,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }

  private async toProfileViews(
    manager: EntityManager,
    tenantId: string,
    profiles: AccessProfile[],
  ): Promise<AccessProfileView[]> {
    if (profiles.length === 0) {
      return [];
    }

    const profileIds = profiles.map((profile) => profile.id);
    const permissions = await manager.find(AccessProfilePermission, {
      where: { tenantId, profileId: In(profileIds) },
      order: { permissionKey: 'ASC' },
    });

    const groupedPermissions = new Map<string, AccessPermissionKey[]>();
    permissions.forEach((entry) => {
      const current = groupedPermissions.get(entry.profileId) ?? [];
      current.push(entry.permissionKey);
      groupedPermissions.set(entry.profileId, current);
    });

    return profiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      description: profile.description,
      baseRoleConstraint: profile.baseRoleConstraint,
      scopeSiteId: profile.scopeSiteId,
      isSystem: profile.isSystem,
      isActive: profile.isActive,
      permissions: groupedPermissions.get(profile.id) ?? [],
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    }));
  }

  private async loadProfilePermissionKeys(
    manager: EntityManager,
    tenantId: string,
    profileId: string,
  ): Promise<AccessPermissionKey[]> {
    const permissions = await manager.find(AccessProfilePermission, {
      where: { tenantId, profileId },
      order: { permissionKey: 'ASC' },
    });

    return permissions.map((permission) => permission.permissionKey);
  }

  private async loadEffectivePermissionSources(
    manager: EntityManager,
    tenantId: string,
    userId: string,
    userRole: UserRole,
  ): Promise<EffectivePermissionSourceView[]> {
    const assignments = await manager.find(UserAccessProfile, {
      where: { tenantId, userId, isActive: true },
      order: { validFrom: 'ASC' },
    });

    if (assignments.length === 0) {
      return [];
    }

    const profiles = await manager.find(AccessProfile, {
      where: {
        tenantId,
        id: In(assignments.map((assignment) => assignment.profileId)),
        isActive: true,
      },
      order: { name: 'ASC' },
    });

    const compatibleProfiles = profiles.filter(
      (profile) => profile.baseRoleConstraint === userRole,
    );
    if (compatibleProfiles.length === 0) {
      return [];
    }

    const permissions = await manager.find(AccessProfilePermission, {
      where: { tenantId, profileId: In(compatibleProfiles.map((profile) => profile.id)) },
      order: { permissionKey: 'ASC' },
    });

    const groupedPermissions = new Map<string, AccessPermissionKey[]>();
    permissions.forEach((permission) => {
      const current = groupedPermissions.get(permission.profileId) ?? [];
      current.push(permission.permissionKey);
      groupedPermissions.set(permission.profileId, current);
    });

    return compatibleProfiles.map((profile) => ({
      profileId: profile.id,
      profileName: profile.name,
      permissions: groupedPermissions.get(profile.id) ?? [],
    }));
  }

  private async findProfileEntity(
    manager: EntityManager,
    tenantId: string,
    id: string,
  ): Promise<AccessProfile> {
    const profile = await manager.findOne(AccessProfile, { where: { tenantId, id } });
    if (!profile) {
      throw new NotFoundException(`Perfil ${id} no encontrado.`);
    }
    return profile;
  }

  private sanitizeProfileForAudit(profile: AccessProfileView) {
    return {
      id: profile.id,
      name: profile.name,
      description: profile.description,
      baseRoleConstraint: profile.baseRoleConstraint,
      scopeSiteId: profile.scopeSiteId,
      isSystem: profile.isSystem,
      isActive: profile.isActive,
      permissions: profile.permissions,
    };
  }

  private buildCollectionDelta<T extends string>(before: T[], after: T[]) {
    const beforeSet = new Set(before);
    const afterSet = new Set(after);

    return {
      added: after.filter((item) => !beforeSet.has(item)).sort(),
      removed: before.filter((item) => !afterSet.has(item)).sort(),
    };
  }

  private currentDate(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private getRecoveryPermissions(role: UserRole): AccessPermissionKey[] {
    if (role !== UserRole.ADMIN) {
      return [];
    }

    return [...(ROLE_ASSIGNABLE_PERMISSION_MATRIX[UserRole.ADMIN] ?? [])];
  }
}
