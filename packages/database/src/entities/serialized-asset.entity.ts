import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { InventoryResponsibleType, SerializedAssetStatus } from '@iwana/shared';

@Index('uq_serialized_assets_tenant_normalized_serial', ['tenantId', 'normalizedSerialNumber'], {
  unique: true,
  where: `"normalized_serial_number" IS NOT NULL`,
})
@Index('uq_serialized_assets_tenant_normalized_mac', ['tenantId', 'normalizedMacAddress'], {
  unique: true,
  where: `"normalized_mac_address" IS NOT NULL`,
})
@Index('idx_serialized_assets_tenant_status', ['tenantId', 'currentStatus'])
@Index('idx_serialized_assets_tenant_location', ['tenantId', 'currentLocationId'])
@Index('idx_serialized_assets_tenant_responsible', [
  'tenantId',
  'currentResponsibleType',
  'currentResponsibleRefId',
])
@Entity({ name: 'serialized_assets' })
export class SerializedAsset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'inventory_item_id', type: 'uuid' })
  inventoryItemId: string;

  @Column({ name: 'serial_number', type: 'varchar', length: 160, nullable: true })
  serialNumber: string | null;

  @Column({ name: 'normalized_serial_number', type: 'varchar', length: 160, nullable: true })
  normalizedSerialNumber: string | null;

  @Column({ name: 'mac_address', type: 'varchar', length: 64, nullable: true })
  macAddress: string | null;

  @Column({ name: 'normalized_mac_address', type: 'varchar', length: 64, nullable: true })
  normalizedMacAddress: string | null;

  @Column({ name: 'asset_tag', type: 'varchar', length: 120, nullable: true })
  assetTag: string | null;

  @Column({
    name: 'current_status',
    type: 'enum',
    enum: SerializedAssetStatus,
    enumName: 'serialized_asset_status',
    default: SerializedAssetStatus.ORDERED,
  })
  currentStatus: SerializedAssetStatus;

  @Column({ name: 'current_location_id', type: 'uuid', nullable: true })
  currentLocationId: string | null;

  @Column({
    name: 'current_responsible_type',
    type: 'enum',
    enum: InventoryResponsibleType,
    enumName: 'inventory_responsible_type',
    default: InventoryResponsibleType.NONE,
  })
  currentResponsibleType: InventoryResponsibleType;

  @Column({ name: 'current_responsible_ref_id', type: 'uuid', nullable: true })
  currentResponsibleRefId: string | null;

  @Column({ name: 'subscriber_ref_id', type: 'uuid', nullable: true })
  subscriberRefId: string | null;

  @Column({ name: 'contract_ref_id', type: 'uuid', nullable: true })
  contractRefId: string | null;

  @Column({ name: 'purchase_order_ref', type: 'varchar', length: 80, nullable: true })
  purchaseOrderRef: string | null;

  @Column({ name: 'purchase_date', type: 'date', nullable: true })
  purchaseDate: string | null;

  @Column({ name: 'useful_life_months', type: 'integer', nullable: true })
  usefulLifeMonths: number | null;

  @Column({ name: 'warranty_until', type: 'date', nullable: true })
  warrantyUntil: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
