import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { AccessPermissionKey } from '@iwana/shared';

@Index(
  'uq_access_profile_permissions_profile_permission',
  ['tenantId', 'profileId', 'permissionKey'],
  {
    unique: true,
  },
)
@Index('idx_access_profile_permissions_tenant_profile', ['tenantId', 'profileId'])
@Entity({ name: 'access_profile_permissions' })
export class AccessProfilePermission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'profile_id', type: 'uuid' })
  profileId: string;

  @Column({ name: 'permission_key', type: 'varchar', length: 120 })
  permissionKey: AccessPermissionKey;
}
