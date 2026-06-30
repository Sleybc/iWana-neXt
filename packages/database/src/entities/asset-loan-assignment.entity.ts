import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Index('idx_asset_loan_assignments_asset', ['serializedAssetId', 'installedAt'])
@Entity({ name: 'asset_loan_assignments' })
export class AssetLoanAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'serialized_asset_id', type: 'uuid' })
  serializedAssetId: string;

  @Column({ name: 'subscriber_ref_id', type: 'uuid' })
  subscriberRefId: string;

  @Column({ name: 'contract_ref_id', type: 'uuid', nullable: true })
  contractRefId: string | null;

  @Column({ name: 'installed_at', type: 'timestamptz' })
  installedAt: Date;

  @Column({ name: 'removed_at', type: 'timestamptz', nullable: true })
  removedAt: Date | null;

  @Column({ name: 'execution_order_ref_id', type: 'uuid', nullable: true })
  executionOrderRefId: string | null;

  @Column({ name: 'stock_movement_id', type: 'uuid', nullable: true })
  stockMovementId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
