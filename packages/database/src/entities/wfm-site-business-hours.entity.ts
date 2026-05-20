import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BusinessHoursWeekday } from '@iwana/shared';

@Index('uq_wfm_site_business_hours_site_weekday', ['tenantId', 'siteId', 'weekday'], {
  unique: true,
})
@Index('idx_wfm_site_business_hours_tenant_site', ['tenantId', 'siteId'])
@Entity({ name: 'wfm_site_business_hours' })
export class WfmSiteBusinessHours {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'site_id', type: 'uuid' })
  siteId: string;

  @Column({
    type: 'enum',
    enum: BusinessHoursWeekday,
    enumName: 'business_hours_weekday_enum',
  })
  weekday: BusinessHoursWeekday;

  @Column({ name: 'start_time', type: 'time', nullable: true })
  startTime: string | null;

  @Column({ name: 'end_time', type: 'time', nullable: true })
  endTime: string | null;

  @Column({ name: 'is_enabled', type: 'boolean', default: true })
  isEnabled: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
