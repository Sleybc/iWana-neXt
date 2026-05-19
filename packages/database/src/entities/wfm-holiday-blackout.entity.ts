import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Index('idx_wfm_holiday_blackouts_tenant_date', ['tenantId', 'blackoutDate'])
@Index('idx_wfm_holiday_blackouts_tenant_site_date', ['tenantId', 'siteId', 'blackoutDate'])
@Entity({ name: 'wfm_holiday_blackouts' })
export class WfmHolidayBlackout {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'site_id', type: 'uuid', nullable: true })
  siteId: string | null;

  @Column({ name: 'blackout_date', type: 'date' })
  blackoutDate: string;

  @Column({ name: 'is_recurring', type: 'boolean', default: false })
  isRecurring: boolean;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @Column({ name: 'is_enabled', type: 'boolean', default: true })
  isEnabled: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
