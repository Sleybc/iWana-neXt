import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ContractStatus } from '../../enums/contract-status.enum';

@Entity({ name: 'contracts' })
@Index('idx_contracts_tenant_status', ['tenantId', 'status'])
@Index('idx_contracts_quote', ['quoteId'])
export class Contract {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'uuid', name: 'quote_id' })
  quoteId: string;

  @Column({ type: 'uuid', name: 'subscriber_id' })
  subscriberId: string;

  @Column({ type: 'varchar', length: 120, name: 'plan_id' })
  planId: string;

  @Column({ type: 'jsonb', name: 'plan_snapshot_json' })
  planSnapshotJson: Record<string, unknown>;

  @Column({ type: 'enum', enum: ContractStatus, name: 'status', default: ContractStatus.DRAFT })
  status: ContractStatus;

  @Column({ type: 'date', name: 'start_date', nullable: true })
  startDate: string | null;

  @Column({ type: 'date', name: 'end_date', nullable: true })
  endDate: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
