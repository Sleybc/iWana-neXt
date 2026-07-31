import { Injectable } from '@nestjs/common';
import {
  AccessProfile,
  AccessProfilePermission,
  OrganizationSite,
  OrganizationSiteAssignment,
  OrganizationSiteResponsibilityEntity,
  User,
  UserAccessProfile,
} from '@iwana/db';
import {
  AccessPermissionKey,
  OrganizationSiteAssignmentType,
  OrganizationSiteResponsibility,
  UserStatus,
} from '@iwana/shared';
import { EntityManager } from 'typeorm';
import {
  OrganizationOperationalAccessInput,
  OrganizationOperationalAccessPort,
} from './organization-operational-access.port';

@Injectable()
export class OrganizationOperationalAccessAdapter extends OrganizationOperationalAccessPort {
  async canSuperviseExecutionOrder(
    manager: EntityManager,
    input: OrganizationOperationalAccessInput,
  ): Promise<boolean> {
    const today = new Date().toISOString().slice(0, 10);
    const result = await manager
      .createQueryBuilder(User, 'user')
      .innerJoin(
        UserAccessProfile,
        'assignment',
        `assignment.tenant_id = :tenantId
         AND assignment.user_id = user.id
         AND assignment.is_active = true
         AND assignment.valid_from <= :today
         AND (assignment.valid_to IS NULL OR assignment.valid_to >= :today)`,
      )
      .innerJoin(
        AccessProfile,
        'profile',
        `profile.id = assignment.profile_id
         AND profile.tenant_id = :tenantId
         AND profile.is_active = true
         AND profile.deleted_at IS NULL
         AND profile.base_role_constraint = user.role
         AND (profile.scope_site_id IS NULL OR profile.scope_site_id = :siteId)`,
      )
      .innerJoin(
        AccessProfilePermission,
        'profilePermission',
        `profilePermission.profile_id = profile.id
         AND profilePermission.tenant_id = :tenantId
         AND profilePermission.permission_key = :supervisePermission`,
      )
      .innerJoin(
        OrganizationSite,
        'site',
        `site.id = :siteId
         AND site.tenant_id = :tenantId
         AND site.is_active = true
         AND site.deleted_at IS NULL`,
      )
      .leftJoin(
        OrganizationSiteAssignment,
        'siteAssignment',
        `siteAssignment.site_id = site.id
         AND siteAssignment.tenant_id = :tenantId
         AND siteAssignment.user_id = user.id
         AND siteAssignment.assignment_type = :supervisorAssignment
         AND siteAssignment.is_active = true
         AND siteAssignment.valid_from <= :today
         AND (siteAssignment.valid_to IS NULL OR siteAssignment.valid_to >= :today)`,
      )
      .leftJoin(
        OrganizationSiteResponsibilityEntity,
        'siteResponsibility',
        `siteResponsibility.site_id = site.id
         AND siteResponsibility.tenant_id = :tenantId
         AND siteResponsibility.user_id = user.id
         AND siteResponsibility.responsibility = :fieldOperationsResponsibility
         AND siteResponsibility.valid_from <= :today
         AND (siteResponsibility.valid_to IS NULL OR siteResponsibility.valid_to >= :today)`,
      )
      .where('user.id = :userId', { userId: input.userId })
      .andWhere('user.tenant_id = :tenantId', { tenantId: input.tenantId })
      .andWhere('user.status = :activeStatus', { activeStatus: UserStatus.ACTIVE })
      .andWhere('(siteAssignment.id IS NOT NULL OR siteResponsibility.id IS NOT NULL)')
      .setParameters({
        tenantId: input.tenantId,
        siteId: input.organizationSiteId,
        today,
        supervisePermission: AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_SUPERVISE,
        supervisorAssignment: OrganizationSiteAssignmentType.SUPERVISOR,
        fieldOperationsResponsibility: OrganizationSiteResponsibility.FIELD_OPERATIONS,
      })
      .select('user.id', 'id')
      .getRawOne<{ id: string }>();

    return result?.id === input.userId;
  }
}
