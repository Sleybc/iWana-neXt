import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { InventoryReversalRejectionReasonCode } from '@iwana/shared';

export type ExecutionOrderItemUsageReversalStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED';

@Index('idx_execution_order_item_usage_reversals_order', ['tenantId', 'executionOrderId'])
@Index('idx_execution_order_item_usage_reversals_usage', ['tenantId', 'itemUsageId'])
@Entity({ name: 'execution_order_item_usage_reversals' })
export class ExecutionOrderItemUsageReversal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'execution_order_id', type: 'uuid' })
  executionOrderId: string;

  @Column({ name: 'item_usage_id', type: 'uuid' })
  itemUsageId: string;

  @Column({ name: 'reversal_request_id', type: 'uuid' })
  reversalRequestId: string;

  /** Motivo de auditoría: permanece en MOD11 y no entra en outbox/jobs/logs. */
  @Column({ type: 'text' })
  reason: string;

  @Column({ name: 'requested_by', type: 'uuid' })
  requestedBy: string;

  @CreateDateColumn({ name: 'requested_at', type: 'timestamptz' })
  requestedAt: Date;

  @Column({ type: 'varchar', length: 16 })
  status: ExecutionOrderItemUsageReversalStatus;

  @Column({ name: 'stock_movement_id', type: 'varchar', length: 160, nullable: true })
  stockMovementId: string | null;

  @Column({ name: 'rejection_reason_code', type: 'varchar', length: 64, nullable: true })
  rejectionReasonCode: InventoryReversalRejectionReasonCode | null;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  @Column({ name: 'last_requested_at', type: 'timestamptz' })
  lastRequestedAt: Date;

  @Column({ name: 'request_attempts', type: 'integer', default: 1 })
  requestAttempts: number;
}
