import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { PurchaseRequestPriority, PurchaseRequestStatus, PurchaseRequestType } from '@iwana/shared';

@Index('idx_purchase_requests_tenant_status', ['tenantId', 'status'])
@Index('idx_purchase_requests_tenant_needed_by', ['tenantId', 'neededByDate'])
@Index('idx_purchase_requests_tenant_type_priority', ['tenantId', 'requestType', 'priority'])
@Entity({ name: 'purchase_requests' })
export class PurchaseRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'request_number', type: 'varchar', length: 40 })
  requestNumber: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({
    type: 'enum',

    enum: PurchaseRequestStatus,

    enumName: 'purchase_request_status',

    default: PurchaseRequestStatus.DRAFT,
  })
  status: PurchaseRequestStatus;

  @Column({
    name: 'request_type',

    type: 'enum',

    enum: PurchaseRequestType,

    enumName: 'purchase_request_type',

    default: PurchaseRequestType.REPLENISHMENT,
  })
  requestType: PurchaseRequestType;

  @Column({
    type: 'enum',

    enum: PurchaseRequestPriority,

    enumName: 'purchase_request_priority',

    default: PurchaseRequestPriority.NORMAL,
  })
  priority: PurchaseRequestPriority;

  @Column({ name: 'requested_by_user_id', type: 'uuid' })
  requestedByUserId: string;

  @Column({ name: 'requesting_area', type: 'varchar', length: 120, nullable: true })
  requestingArea: string | null;

  @Column({ type: 'text', nullable: true })
  justification: string | null;

  @Column({ name: 'operational_ref_type', type: 'varchar', length: 60, nullable: true })
  operationalRefType: string | null;

  @Column({ name: 'operational_ref_id', type: 'varchar', length: 160, nullable: true })
  operationalRefId: string | null;

  @Column({ name: 'exception_reason', type: 'text', nullable: true })
  exceptionReason: string | null;

  @Column({ name: 'approved_by_user_id', type: 'uuid', nullable: true })
  approvedByUserId: string | null;

  @Column({ name: 'needed_by_date', type: 'date', nullable: true })
  neededByDate: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
