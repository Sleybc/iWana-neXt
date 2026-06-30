import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { OrganizationSiteType } from '@iwana/shared';

@Index('uq_organization_sites_tenant_code', ['tenantId', 'code'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Index('uq_organization_sites_tenant_primary', ['tenantId', 'isPrimary'], {
  unique: true,
  where: '"deleted_at" IS NULL AND "is_primary" = true',
})
@Index('idx_organization_sites_tenant_active', ['tenantId', 'isActive'], {
  where: '"deleted_at" IS NULL',
})
@Entity({ name: 'organization_sites' })
export class OrganizationSite {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({ type: 'varchar', length: 40 })
  code: string;

  @Column({ name: 'site_type', type: 'varchar', length: 40 })
  siteType: OrganizationSiteType;

  @Column({ type: 'varchar', length: 240, nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  municipality: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  department: string | null;

  @Column({ type: 'varchar', length: 2, default: 'CO' })
  country: string;

  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
  latitude: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
  longitude: string | null;

  @Column({ name: 'contact_name', type: 'varchar', length: 160, nullable: true })
  contactName: string | null;

  @Column({ name: 'contact_phone', type: 'varchar', length: 32, nullable: true })
  contactPhone: string | null;

  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
