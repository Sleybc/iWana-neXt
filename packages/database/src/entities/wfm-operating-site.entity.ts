import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Index('uq_wfm_operating_sites_tenant_name', ['tenantId', 'name'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Index('uq_wfm_operating_sites_tenant_code', ['tenantId', 'code'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Index('idx_wfm_operating_sites_tenant_active', ['tenantId', 'isActive'], {
  where: '"deleted_at" IS NULL',
})
@Entity({ name: 'wfm_operating_sites' })
export class WfmOperatingSite {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 40 })
  code: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  municipality: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  sector: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
  latitude: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
  longitude: string | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
