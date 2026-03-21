import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'plan_catalog_items' })
@Index('idx_plan_catalog_items_tenant_active', ['tenantId', 'isActive'])
export class PlanCatalogItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'varchar', length: 140 })
  name: string;

  @Column({
    type: 'varchar',
    length: 100,
  })
  technology: string;

  @Column({
    type: 'varchar',
    length: 30,
    name: 'installation_rule',
    default: 'ALWAYS',
  })
  installationRule: string;

  @Column({ type: 'integer', name: 'download_speed_mbps' })
  downloadSpeedMbps: number;

  @Column({ type: 'integer', name: 'upload_speed_mbps' })
  uploadSpeedMbps: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, name: 'base_price' })
  basePrice: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, name: 'installation_fee' })
  installationFee: string;

  @Column({ type: 'timestamptz', name: 'valid_from', nullable: true })
  validFrom: Date | null;

  @Column({ type: 'timestamptz', name: 'valid_to', nullable: true })
  validTo: Date | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
