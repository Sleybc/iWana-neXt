import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PurchaseRequestLineSourceKind, PurchaseRequestLineStatus } from '@iwana/shared';

@Index('idx_purchase_request_lines_tenant_request', ['tenantId', 'purchaseRequestId'])
@Index('idx_purchase_request_lines_tenant_status', ['tenantId', 'lineStatus'])
@Index('idx_purchase_request_lines_tenant_item', ['tenantId', 'inventoryItemId'])
@Entity({ name: 'purchase_request_lines' })
export class PurchaseRequestLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'purchase_request_id', type: 'uuid' })
  purchaseRequestId: string;

  @Column({
    name: 'source_kind',
    type: 'enum',
    enum: PurchaseRequestLineSourceKind,
    enumName: 'purchase_request_line_source_kind',
  })
  sourceKind: PurchaseRequestLineSourceKind;

  @Column({ name: 'inventory_item_id', type: 'uuid', nullable: true })
  inventoryItemId: string | null;

  @Column({ name: 'free_text_description', type: 'varchar', length: 500, nullable: true })
  freeTextDescription: string | null;

  @Column({ name: 'quantity_requested', type: 'numeric', precision: 12, scale: 2 })
  quantityRequested: string;

  @Column({ name: 'unit_of_measure', type: 'varchar', length: 32 })
  unitOfMeasure: string;

  @Column({ name: 'suggested_party_ref_id', type: 'uuid', nullable: true })
  suggestedPartyRefId: string | null;

  @Column({
    name: 'line_status',
    type: 'enum',
    enum: PurchaseRequestLineStatus,
    enumName: 'purchase_request_line_status',
    default: PurchaseRequestLineStatus.OPEN,
  })
  lineStatus: PurchaseRequestLineStatus;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
