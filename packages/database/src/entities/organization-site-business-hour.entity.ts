import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BusinessHoursWeekday } from '@iwana/shared';

@Index('uq_organization_site_business_hours_site_weekday', ['tenantId', 'siteId', 'weekday'], {
  unique: true,
})
@Index('idx_organization_site_business_hours_tenant_site', ['tenantId', 'siteId'])
@Entity({ name: 'organization_site_business_hours' })
export class OrganizationSiteBusinessHour {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'site_id', type: 'uuid' })
  siteId: string;

  @Column({ type: 'enum', enum: BusinessHoursWeekday, enumName: 'business_hours_weekday_enum' })
  weekday: BusinessHoursWeekday;

  @Column({ name: 'opens_at', type: 'time', nullable: true })
  opensAt: string | null;

  @Column({ name: 'closes_at', type: 'time', nullable: true })
  closesAt: string | null;

  @Column({ name: 'is_open', type: 'boolean', default: true })
  isOpen: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
