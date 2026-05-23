import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { OrganizationSiteCapability } from '@iwana/shared';

@Index('uq_organization_site_capabilities_site_capability', ['tenantId', 'siteId', 'capability'], {
  unique: true,
})
@Index('idx_organization_site_capabilities_tenant_site', ['tenantId', 'siteId'])
@Entity({ name: 'organization_site_capabilities' })
export class OrganizationSiteCapabilityEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'site_id', type: 'uuid' })
  siteId: string;

  @Column({ type: 'varchar', length: 40 })
  capability: OrganizationSiteCapability;

  @Column({ name: 'is_enabled', type: 'boolean', default: true })
  isEnabled: boolean;
}
