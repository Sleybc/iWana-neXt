import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { OrganizationSiteResponsibility } from '@iwana/shared';

@Index('idx_organization_site_responsibilities_tenant_site', ['tenantId', 'siteId'])
@Index(
  'uq_organization_site_responsibilities_current',
  ['tenantId', 'siteId', 'responsibility', 'validTo'],
  {
    unique: true,
  },
)
@Entity({ name: 'organization_site_responsibilities' })
export class OrganizationSiteResponsibilityEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'site_id', type: 'uuid' })
  siteId: string;

  @Column({ type: 'varchar', length: 40 })
  responsibility: OrganizationSiteResponsibility;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'valid_from', type: 'date', default: () => 'CURRENT_DATE' })
  validFrom: string;

  @Column({ name: 'valid_to', type: 'date', nullable: true })
  validTo: string | null;
}
