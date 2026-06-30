import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { OrganizationSiteAssignmentType } from '@iwana/shared';

@Index('idx_organization_site_assignments_tenant_site_active', ['tenantId', 'siteId', 'isActive'])
@Index('idx_organization_site_assignments_tenant_user_active', ['tenantId', 'userId', 'isActive'])
@Entity({ name: 'organization_site_assignments' })
export class OrganizationSiteAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'site_id', type: 'uuid' })
  siteId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'assignment_type', type: 'varchar', length: 40 })
  assignmentType: OrganizationSiteAssignmentType;

  @Column({ name: 'valid_from', type: 'date', default: () => 'CURRENT_DATE' })
  validFrom: string;

  @Column({ name: 'valid_to', type: 'date', nullable: true })
  validTo: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
}
