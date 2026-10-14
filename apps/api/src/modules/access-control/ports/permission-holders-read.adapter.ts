import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AccessPermissionKey, UserRole, UserStatus } from '@iwana/shared';
import { ROLE_ASSIGNABLE_PERMISSION_MATRIX_V2 } from '../access-control.constants';
import { IPermissionHoldersReadPort, PermissionHolder } from './permission-holders-read.port';

interface PermissionHolderRow {
  userId: string;
  email: string;
}

function bogotaCivilDate(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string): string => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

@Injectable()
export class PermissionHoldersReadAdapter implements IPermissionHoldersReadPort {
  async holders(
    permission: AccessPermissionKey,
    manager: EntityManager,
  ): Promise<PermissionHolder[]> {
    const rows = (await manager.query(
      `SELECT DISTINCT users.id::text AS "userId", users.email
       FROM users
       WHERE users.status = $2
         AND users.deleted_at IS NULL
         AND users.email IS NOT NULL
         AND BTRIM(users.email) <> ''
         AND (
           (users.role = $3 AND $1 = ANY($4::text[]))
           OR EXISTS (
             SELECT 1
             FROM user_access_profiles assignment
             INNER JOIN access_profiles profile
               ON profile.id = assignment.profile_id
              AND profile.tenant_id = users.tenant_id
             INNER JOIN access_profile_permissions profile_permission
               ON profile_permission.profile_id = profile.id
              AND profile_permission.tenant_id = users.tenant_id
             WHERE assignment.tenant_id = users.tenant_id
               AND assignment.user_id = users.id
               AND assignment.is_active = TRUE
               AND assignment.valid_from <= $5::date
               AND (assignment.valid_to IS NULL OR assignment.valid_to >= $5::date)
               AND profile.is_active = TRUE
               AND profile.deleted_at IS NULL
               AND profile.base_role_constraint = users.role
               AND profile.scope_site_id IS NULL
               AND profile_permission.permission_key = $1
           )
         )
       ORDER BY LOWER(users.email), users.id`,
      [
        permission,
        UserStatus.ACTIVE,
        UserRole.ADMIN,
        ROLE_ASSIGNABLE_PERMISSION_MATRIX_V2[UserRole.ADMIN],
        bogotaCivilDate(new Date()),
      ],
    )) as PermissionHolderRow[];

    return rows.filter(
      (row): row is PermissionHolder =>
        typeof row.userId === 'string' &&
        row.userId.trim() !== '' &&
        typeof row.email === 'string' &&
        row.email.trim() !== '',
    );
  }
}
