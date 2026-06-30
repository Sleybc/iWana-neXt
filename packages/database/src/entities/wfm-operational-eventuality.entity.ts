import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { OperationalEventualityStatus, OperationalEventualityType } from '@iwana/shared';

@Index('idx_wfm_oe_tenant_user', ['tenantId', 'userId'], {
  where: 'deleted_at IS NULL',
})
@Index('idx_wfm_oe_tenant_site', ['tenantId', 'organizationSiteId'], {
  where: 'organization_site_id IS NOT NULL AND deleted_at IS NULL',
})
@Index('idx_wfm_oe_tenant_time_range', ['tenantId', 'startsAt', 'endsAt'], {
  where: 'deleted_at IS NULL',
})
@Entity({ name: 'wfm_operational_eventualities' })
export class WfmOperationalEventuality {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'organization_site_id', type: 'uuid', nullable: true })
  organizationSiteId: string | null;

  @Column({ name: 'type', type: 'varchar', length: 40 })
  type: OperationalEventualityType;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'pending' })
  status: OperationalEventualityStatus;

  @Column({ name: 'starts_at', type: 'timestamptz' })
  startsAt: Date;

  @Column({ name: 'ends_at', type: 'timestamptz' })
  endsAt: Date;

  @Column({ name: 'reason', type: 'varchar', length: 320, nullable: true })
  reason: string | null;

  @Column({ name: 'origin', type: 'varchar', length: 80, nullable: true })
  origin: string | null;

  @Column({ name: 'requires_hr_review', type: 'boolean', default: false })
  requiresHrReview: boolean;

  @Column({ name: 'created_by_id', type: 'uuid' })
  createdById: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
