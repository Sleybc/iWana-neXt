import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import {
  AccessPermissionAvailability,
  AccessPermissionCatalogVersion,
  AccessPermissionKey,
} from '@iwana/shared';

@Index('uq_access_permission_catalog_tenant_key', ['tenantId', 'permissionKey'], {
  unique: true,
})
@Index('idx_access_permission_catalog_tenant_module', ['tenantId', 'moduleKey'])
@Entity({ name: 'access_permission_catalog' })
export class AccessPermissionCatalog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'permission_key', type: 'varchar', length: 120 })
  permissionKey: AccessPermissionKey;

  @Column({ name: 'module_key', type: 'varchar', length: 60 })
  moduleKey: string;

  @Column({ type: 'varchar', length: 60 })
  action: string;

  @Column({ type: 'varchar', length: 240 })
  description: string;

  @Column({ name: 'catalog_version', type: 'varchar', length: 40 })
  catalogVersion: AccessPermissionCatalogVersion;

  @Column({ type: 'varchar', length: 20 })
  availability: AccessPermissionAvailability;

  @Column({ name: 'is_system', type: 'boolean', default: true })
  isSystem: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
}
