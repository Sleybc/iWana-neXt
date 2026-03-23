import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'coverage_zones' })
@Index('idx_coverage_zones_tenant_active', ['tenantId', 'isActive'])
export class CoverageZone {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'double precision', name: 'center_latitude' })
  centerLatitude: number;

  @Column({ type: 'double precision', name: 'center_longitude' })
  centerLongitude: number;

  @Column({ type: 'numeric', precision: 6, scale: 2, name: 'radius_km' })
  radiusKm: string;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
