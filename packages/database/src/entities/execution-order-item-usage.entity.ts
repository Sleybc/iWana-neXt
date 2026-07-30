import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { ExecutionOrderItemAction, InventoryDisposition } from '@iwana/shared';

@Index('idx_execution_order_item_usage_order', ['executionOrderId', 'createdAt'])
@Index('idx_execution_order_item_usage_inventory_request', ['tenantId', 'inventoryRequestId'])
@Entity({ name: 'execution_order_item_usage' })
export class ExecutionOrderItemUsage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'execution_order_id', type: 'uuid' })
  executionOrderId: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'item_id', type: 'varchar', length: 160 })
  itemId: string;

  @Column({ name: 'technician_custody_id', type: 'varchar', length: 160 })
  technicianCustodyId: string;

  @Column({ type: 'integer', default: 1 })
  quantity: number;

  @Column({ name: 'serial_number', type: 'varchar', length: 160, nullable: true })
  serialNumber: string | null;

  @Column({
    type: 'enum',
    enum: ExecutionOrderItemAction,
    enumName: 'execution_order_item_action',
  })
  action: ExecutionOrderItemAction;

  @Column({
    name: 'final_disposition',
    type: 'enum',
    enum: InventoryDisposition,
    enumName: 'inventory_disposition',
  })
  finalDisposition: InventoryDisposition;

  @Column({ name: 'stock_movement_id', type: 'varchar', length: 160, nullable: true })
  stockMovementId: string | null;

  /** DATA-P0-2: Identificador de la solicitud de inventario (MOD12). */
  @Column({ name: 'inventory_request_id', type: 'uuid', nullable: true })
  inventoryRequestId: string | null;

  /** DATA-P0-2: Estado del movimiento de inventario vinculado. */
  @Column({
    name: 'movement_status',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  movementStatus: 'PENDING' | 'CONFIRMED' | 'REJECTED' | null;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
