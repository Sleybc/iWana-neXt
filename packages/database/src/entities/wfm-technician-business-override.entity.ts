import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BusinessHoursWeekday } from '@iwana/shared';

@Index('idx_wfm_technician_overrides_tenant_user_date', ['tenantId', 'userId', 'overrideDate'])
@Index('idx_wfm_technician_overrides_tenant_user_weekday', ['tenantId', 'userId', 'weekday'])
@Index('idx_wfm_technician_overrides_tenant_site', ['tenantId', 'siteId'])
@Entity({ name: 'wfm_technician_business_overrides' })
export class WfmTechnicianBusinessOverride {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'site_id', type: 'uuid', nullable: true })
  siteId: string | null;

  @Column({ name: 'override_date', type: 'date', nullable: true })
  overrideDate: string | null;

  @Column({
    type: 'enum',
    enum: BusinessHoursWeekday,
    enumName: 'business_hours_weekday_enum',
    nullable: true,
  })
  weekday: BusinessHoursWeekday | null;

  @Column({ name: 'start_time', type: 'time', nullable: true })
  startTime: string | null;

  @Column({ name: 'end_time', type: 'time', nullable: true })
  endTime: string | null;

  @Column({ name: 'is_enabled', type: 'boolean', default: true })
  isEnabled: boolean;

  @Column({ type: 'varchar', length: 160, nullable: true })
  reason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
