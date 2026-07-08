import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StockIssueStatus, StockIssueType } from '@iwana/shared';

@Index('idx_stock_issues_tenant_status_created_at', ['tenantId', 'status', 'createdAt'])
@Index('idx_stock_issues_tenant_type_status', ['tenantId', 'type', 'status'])
@Index('idx_stock_issues_tenant_source_location', ['tenantId', 'sourceLocationId', 'createdAt'])
@Index('idx_stock_issues_tenant_destination_location', [
  'tenantId',
  'destinationLocationId',
  'createdAt',
])
@Entity({ name: 'stock_issues' })
export class StockIssue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({
    type: 'enum',
    enum: StockIssueType,
    enumName: 'stock_issue_type',
  })
  type: StockIssueType;

  @Column({
    type: 'enum',
    enum: StockIssueStatus,
    enumName: 'stock_issue_status',
    default: StockIssueStatus.DRAFT,
  })
  status: StockIssueStatus;

  @Column({ name: 'source_location_id', type: 'uuid' })
  sourceLocationId: string;

  @Column({ name: 'destination_location_id', type: 'uuid', nullable: true })
  destinationLocationId: string | null;

  /**
   * Referencia opaca para destinos que no están modelados como stock_location.
   * No tiene FK para evitar acoplamiento cross-module.
   */
  @Column({ name: 'destination_ref_id', type: 'varchar', length: 160, nullable: true })
  destinationRefId: string | null;

  @Column({ name: 'origin_ref_id', type: 'varchar', length: 160, nullable: true })
  originRefId: string | null;

  @Column({ name: 'commercial_ref_id', type: 'varchar', length: 160, nullable: true })
  commercialRefId: string | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ name: 'cost_center', type: 'varchar', length: 80, nullable: true })
  costCenter: string | null;

  @Column({ name: 'handoff_method', type: 'varchar', length: 32, nullable: true })
  handoffMethod: string | null;

  @Column({ name: 'handoff_notes', type: 'text', nullable: true })
  handoffNotes: string | null;

  @Column({ name: 'handoff_attachments', type: 'jsonb', nullable: true })
  handoffAttachments: unknown[] | null;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId: string | null;

  @Column({ name: 'dispatched_by_user_id', type: 'uuid', nullable: true })
  dispatchedByUserId: string | null;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @Column({ name: 'stock_movement_id', type: 'uuid', nullable: true })
  stockMovementId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
