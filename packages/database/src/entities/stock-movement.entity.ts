import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StockMovementOrigin } from '@iwana/shared';

@Index('uq_stock_movements_tenant_idempotency_key', ['tenantId', 'idempotencyKey'], {
  unique: true,
})
@Index('idx_stock_movements_tenant_created_at', ['tenantId', 'createdAt'])
@Index('idx_stock_movements_tenant_origin', ['tenantId', 'originContext', 'originRefId'])
@Entity({ name: 'stock_movements' })
export class StockMovement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'movement_number', type: 'varchar', length: 40 })
  movementNumber: string;

  @Column({
    type: 'enum',
    enum: StockMovementOrigin,
    enumName: 'stock_movement_origin',
  })
  origin: StockMovementOrigin;

  @Column({ name: 'origin_context', type: 'varchar', length: 64 })
  originContext: string;

  @Column({ name: 'origin_ref_id', type: 'varchar', length: 160, nullable: true })
  originRefId: string | null;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 160 })
  idempotencyKey: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId: string | null;

  @Column({ name: 'reversed_by_movement_id', type: 'uuid', nullable: true })
  reversedByMovementId: string | null;

  @Column({ name: 'is_reversal', type: 'boolean', default: false })
  isReversal: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
