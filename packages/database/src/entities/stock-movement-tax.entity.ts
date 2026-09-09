import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Index('idx_stock_movement_taxes_tenant_movement', ['tenantId', 'stockMovementId'])
@Index('uq_stock_movement_taxes_movement_tax_code', ['stockMovementId', 'taxCode'], {
  unique: true,
})
@Entity({ name: 'stock_movement_taxes' })
export class StockMovementTax {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'stock_movement_id', type: 'uuid' })
  stockMovementId: string;

  @Column({ name: 'tax_code', type: 'varchar', length: 32 })
  taxCode: string;

  @Column({ name: 'tax_category', type: 'varchar', length: 20 })
  taxCategory: string;

  @Column({ type: 'varchar', length: 10 })
  effect: string;

  @Column({ type: 'numeric', precision: 7, scale: 4 })
  rate: string;

  @Column({ name: 'base_amount', type: 'numeric', precision: 14, scale: 2 })
  baseAmount: string;

  @Column({ name: 'tax_amount', type: 'numeric', precision: 14, scale: 2 })
  taxAmount: string;

  @Column({ name: 'tax_definition_id', type: 'uuid', nullable: true })
  taxDefinitionId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
