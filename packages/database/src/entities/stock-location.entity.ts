import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StockLocationStatus, StockLocationType } from '@iwana/shared';

@Index('idx_stock_locations_tenant_type_status', ['tenantId', 'type', 'status'])
@Index('uq_stock_locations_active_mobile_responsible', ['tenantId', 'responsibleRefId'], {
  unique: true,
  where: `"responsible_ref_id" IS NOT NULL AND "type" IN ('MOBILE_TECHNICIAN', 'MOBILE_CREW') AND "status" = 'ACTIVE'`,
})
@Entity({ name: 'stock_locations' })
export class StockLocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', length: 60 })
  code: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({
    type: 'enum',
    enum: StockLocationType,
    enumName: 'stock_location_type',
  })
  type: StockLocationType;

  @Column({
    type: 'enum',
    enum: StockLocationStatus,
    enumName: 'stock_location_status',
    default: StockLocationStatus.ACTIVE,
  })
  status: StockLocationStatus;

  @Column({ name: 'responsible_ref_id', type: 'uuid', nullable: true })
  responsibleRefId: string | null;

  @Column({ name: 'max_capacity', type: 'numeric', precision: 12, scale: 2, nullable: true })
  maxCapacity: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
